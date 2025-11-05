import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NetworkConstruct } from './constructs/network/network-construct';
import { SecurityConstruct } from './constructs/security/security-construct';
import { IamConstruct } from './constructs/iam/iam-construct';
import { DatabaseConstruct } from './constructs/database/database-construct';
import { Route53Construct } from './constructs/route53/route53-construct';

export interface InfrastructureStackProps extends cdk.StackProps {
  awsRegion: string;
  vpcCidr: string;
  publicSubnetCidrs: string[];
  privateSubnetCidrs: string[];
  databaseSubnetCidrs: string[];
  availabilityZones: string[];
  environment: string;
  projectName: string;
  dbUsername: string;
  dbPassword: string;
  dbName: string;
  domainName: string;
  blockedIpAddresses: string[];
  maxRequestSize: number;
  requestLimit: number;
  enableSecurityHub: boolean;
  jenkinsRoleName: string;
}

export class InfrastructureStack extends cdk.Stack {
  // Expose resources that will be needed by the application stack
  public readonly vpc: cdk.aws_ec2.Vpc;
  public readonly publicSubnets: cdk.aws_ec2.ISubnet[];
  public readonly privateSubnets: cdk.aws_ec2.ISubnet[];
  public readonly albSecurityGroup: cdk.aws_ec2.SecurityGroup;
  public readonly ecsSecurityGroup: cdk.aws_ec2.SecurityGroup;
  public readonly jenkinsSecurityGroup: cdk.aws_ec2.SecurityGroup;
  public readonly dbSecurityGroup: cdk.aws_ec2.SecurityGroup;
  public readonly ecsTaskExecutionRole: cdk.aws_iam.Role;
  public readonly ecsTaskRole: cdk.aws_iam.Role;
  public readonly dbInstance: cdk.aws_rds.DatabaseInstance;
  
  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);
  
    // Check for required environment variables
    if (!props.dbUsername || props.dbUsername === '') {
      throw new Error('DB_USERNAME environment variable must be set');
    }
  
    if (!props.dbPassword || props.dbPassword === '') {
      throw new Error('DB_PASSWORD environment variable must be set');
    }

    // Create network resources (VPC, subnets, etc.)
    const network = new NetworkConstruct(this, 'Network', {
      vpcCidr: props.vpcCidr,
      publicSubnetCidrs: props.publicSubnetCidrs,
      privateSubnetCidrs: props.privateSubnetCidrs,
      databaseSubnetCidrs: props.databaseSubnetCidrs,
      availabilityZones: props.availabilityZones,
      environment: props.environment,
      projectName: props.projectName,
    });
    
    this.vpc = network.vpc;
    this.publicSubnets = network.publicSubnets;
    this.privateSubnets = network.privateSubnets;

    // Create security resources (WAF, Security groups, etc.)
    const security = new SecurityConstruct(this, 'Security', {
      vpc: network.vpc,
      environment: props.environment,
      projectName: props.projectName,
      blockedIpAddresses: props.blockedIpAddresses,
      maxRequestSize: props.maxRequestSize,
      requestLimit: props.requestLimit,
      enableSecurityHub: props.enableSecurityHub,
      awsRegion: props.awsRegion,
    });
    
    this.albSecurityGroup = security.albSecurityGroup;
    this.ecsSecurityGroup = security.ecsSecurityGroup;
    this.jenkinsSecurityGroup = security.jenkinsSecurityGroup;
    this.dbSecurityGroup = security.dbSecurityGroup;

    // Create IAM roles and policies
    const iam = new IamConstruct(this, 'IAM', {
      environment: props.environment,
      projectName: props.projectName,
      jenkinsRoleName: props.jenkinsRoleName,
    });
    
    this.ecsTaskExecutionRole = iam.ecsTaskExecutionRole;
    this.ecsTaskRole = iam.ecsTaskRole;

    // Create database resources
    const database = new DatabaseConstruct(this, 'Database', {
      vpc: network.vpc,
      databaseSubnets: network.databaseSubnets,
      dbSecurityGroup: security.dbSecurityGroup,
      environment: props.environment,
      projectName: props.projectName,
      dbUsername: props.dbUsername,
      dbPassword: props.dbPassword,
      dbName: props.dbName,
    });
    
    this.dbInstance = database.dbInstance;

    // Create Route53 resources
    const route53 = new Route53Construct(this, 'Route53', {
      domainName: props.domainName,
      environment: props.environment,
      projectName: props.projectName,
      // We can't connect this to the load balancer yet since it's in the application stack
      // We'll need to add this connection later
      loadBalancerDnsName: '',
      loadBalancerCanonicalHostedZoneId: '',
    });

    // Export outputs for cross-stack references
    new cdk.CfnOutput(this, 'VpcId', {
      value: network.vpc.vpcId,
      description: 'The ID of the VPC',
      exportName: `${props.projectName}-${props.environment}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnets', {
      value: network.publicSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Public Subnet IDs',
      exportName: `${props.projectName}-${props.environment}-public-subnets`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnets', {
      value: network.privateSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Private Subnet IDs',
      exportName: `${props.projectName}-${props.environment}-private-subnets`,
    });

    new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
      value: security.albSecurityGroup.securityGroupId,
      description: 'ALB Security Group ID',
      exportName: `${props.projectName}-${props.environment}-alb-sg-id`,
    });

    new cdk.CfnOutput(this, 'EcsSecurityGroupId', {
      value: security.ecsSecurityGroup.securityGroupId,
      description: 'ECS Security Group ID',
      exportName: `${props.projectName}-${props.environment}-ecs-sg-id`,
    });

    new cdk.CfnOutput(this, 'JenkinsSecurityGroupId', {
      value: security.jenkinsSecurityGroup.securityGroupId,
      description: 'Jenkins Security Group ID',
      exportName: `${props.projectName}-${props.environment}-jenkins-sg-id`,
    });

    new cdk.CfnOutput(this, 'EcsTaskExecutionRoleArn', {
      value: iam.ecsTaskExecutionRole.roleArn,
      description: 'ECS Task Execution Role ARN',
      exportName: `${props.projectName}-${props.environment}-ecs-execution-role-arn`,
    });

    new cdk.CfnOutput(this, 'EcsTaskRoleArn', {
      value: iam.ecsTaskRole.roleArn,
      description: 'ECS Task Role ARN',
      exportName: `${props.projectName}-${props.environment}-ecs-task-role-arn`,
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.dbInstance.dbInstanceEndpointAddress,
      description: 'Endpoint of the database',
      exportName: `${props.projectName}-${props.environment}-db-endpoint`,
    });
  }
}