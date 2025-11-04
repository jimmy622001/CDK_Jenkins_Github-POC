import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface NetworkConstructProps {
  vpcCidr: string;
  publicSubnetCidrs: string[];
  privateSubnetCidrs: string[];
  databaseSubnetCidrs: string[];
  availabilityZones: string[];
  environment: string;
  projectName: string;
}

export class NetworkConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly privateSubnets: ec2.ISubnet[];
  public readonly databaseSubnets: ec2.ISubnet[];
  public readonly albLogsS3Bucket: s3.Bucket;
  public readonly albLogsAccessS3Bucket: s3.Bucket;
  public readonly replicationLogsS3Bucket: s3.Bucket;
  public readonly s3KmsKey: kms.Key;
  public readonly logsKey: kms.Key;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly vpcFlowLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: NetworkConstructProps) {
    super(scope, id);

    // KMS Key for S3 bucket encryption
    this.s3KmsKey = new kms.Key(this, 'S3KmsKey', {
      description: 'KMS key for S3 bucket encryption',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.s3KmsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['kms:*'],
        resources: ['*'],
        principals: [new iam.AccountRootPrincipal()],
      })
    );

    // KMS Key for VPC flow logs
    this.logsKey = new kms.Key(this, 'LogsKey', {
      description: 'KMS key for VPC flow logs',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create VPC
    this.vpc = new ec2.Vpc(this, 'VPC', {
      cidr: props.vpcCidr,
      maxAzs: props.availabilityZones.length,
      natGateways: 1, // Use 1 NAT Gateway for cost efficiency in non-prod environments
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'database',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Use VPC's created subnets instead of manually creating them
    this.publicSubnets = this.vpc.publicSubnets;
    this.privateSubnets = this.vpc.privateSubnets;
    this.databaseSubnets = this.vpc.isolatedSubnets;

    // Generate a random string for bucket names
    const suffixId = `${props.environment}-${Math.floor(Math.random() * 100000000).toString(36)}`;

    // S3 Bucket for ALB logs
    this.albLogsS3Bucket = new s3.Bucket(this, 'AlbLogsBucket', {
      bucketName: `alb-logs-${suffixId}`,
      removalPolicy: props.environment !== 'prod' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.s3KmsKey,
      versioned: true,
      lifecycleRules: [
        {
          id: 'log',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // S3 Bucket for ALB logs access logging
    this.albLogsAccessS3Bucket = new s3.Bucket(this, 'AlbLogsAccessBucket', {
      bucketName: `alb-logs-access-${suffixId}`,
      removalPolicy: props.environment !== 'prod' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.s3KmsKey,
      versioned: true,
      lifecycleRules: [
        {
          id: 'access-logs',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // S3 Bucket for cross-region replication logs
    this.replicationLogsS3Bucket = new s3.Bucket(this, 'ReplicationLogsBucket', {
      bucketName: `replication-logs-${suffixId}`,
      removalPolicy: props.environment !== 'prod' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.s3KmsKey,
      versioned: true,
      lifecycleRules: [
        {
          id: 'replication-logs',
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
    });

    // Set up logging configurations
    this.albLogsS3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new cdk.aws_s3_notifications.SnsDestination(
        new cdk.aws_sns.Topic(this, 'AlbLogsNotificationTopic')
      )
    );

    // Create VPC Flow Log
    this.vpcFlowLogGroup = new logs.LogGroup(this, 'VpcFlowLogs', {
      logGroupName: '/aws/vpc/flow-logs',
      retention: logs.RetentionDays.ONE_YEAR,
      encryptionKey: this.logsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create IAM role for VPC Flow Logs
    const vpcFlowLogsRole = new iam.Role(this, 'VpcFlowLogsRole', {
      assumedBy: new iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    vpcFlowLogsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
        ],
        resources: ['*'],
      })
    );

    // Create VPC Flow Logs
    new ec2.CfnFlowLog(this, 'VpcFlowLog', {
      resourceType: 'VPC',
      resourceId: this.vpc.vpcId,
      trafficType: 'ALL',
      logDestinationType: 'cloud-watch-logs',
      logDestination: this.vpcFlowLogGroup.logGroupArn,
      deliverLogsPermissionArn: vpcFlowLogsRole.roleArn,
    });

    // Security Groups
    // ALB Security Group
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for application load balancer',
      allowAllOutbound: false,
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS from internet'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP from internet (for redirection to HTTPS)'
    );

    this.albSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(props.vpcCidr),
      ec2.Port.tcp(80),
      'HTTP to ECS services'
    );

    this.albSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS to internet for external resources'
    );

    // ECS Security Group
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: false,
    });

    this.ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpcCidr),
      ec2.Port.tcp(80),
      'HTTP from VPC'
    );

    this.ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpcCidr),
      ec2.Port.tcp(8080),
      'Inter-container communication'
    );

    this.ecsSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS to internet for external resources'
    );

    // Database Security Group
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for database instances',
      allowAllOutbound: false,
    });

    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpcCidr),
      ec2.Port.tcp(5432),
      'Database port from VPC'
    );

    this.dbSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(props.vpcCidr),
      ec2.Port.tcpRange(1024, 65535),
      'Response traffic to VPC'
    );

    // Add egress rule from ECS to DB
    this.ecsSecurityGroup.addEgressRule(
      this.dbSecurityGroup,
      ec2.Port.tcp(5432),
      'Database access'
    );

    // Restrict Default Security Group
    const defaultSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'DefaultSecurityGroup',
      this.vpc.vpcDefaultSecurityGroup
    );

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}