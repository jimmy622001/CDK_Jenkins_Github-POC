import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export interface EcsConstructProps {
  vpc: ec2.IVpc;
  publicSubnets: ec2.ISubnet[];
  privateSubnets: ec2.ISubnet[];
  albSecurityGroup: ec2.ISecurityGroup;
  ecsSecurityGroup: ec2.ISecurityGroup;
  jenkinsSecurityGroup: ec2.ISecurityGroup;
  ecsTaskExecutionRole: iam.IRole;
  ecsTaskRole: iam.IRole;
  keyName: string;
  environment: string;
  projectName: string;
  containerPort: number;
  domainName: string;
  ec2InstanceType: string;
  minInstanceCount: number;
  maxInstanceCount: number;
  desiredInstanceCount: number;
  useSpotInstances: boolean;
  spotPrice: string;
}

export class EcsConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: EcsConstructProps) {
    super(scope, id);

    // Create ECS Cluster
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: props.vpc,
      containerInsights: true,
      clusterName: `${props.projectName}-${props.environment}-cluster`,
    });

    // CloudWatch Log Group for ECS
    const ecsLogGroup = new logs.LogGroup(this, 'EcsLogs', {
      logGroupName: `/ecs/${props.projectName}-${props.environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSecurityGroup,
      vpcSubnets: {
        subnets: props.publicSubnets,
      },
      loadBalancerName: `${props.projectName}-${props.environment}-alb`,
      deletionProtection: false,
    });

    // Create target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: props.vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
        port: 'traffic-port',
      },
      targetGroupName: `${props.projectName}-${props.environment}-tg`,
    });

    // Create HTTP listener with redirect
    const httpListener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect({
        port: '443',
        protocol: 'HTTPS',
      }),
    });

    // Create self-signed certificate for testing
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(),
    });

    // Create HTTPS listener
    const httpsListener = this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [this.certificate],
      sslPolicy: elbv2.SslPolicy.TLS12,
      open: true,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // Create Security Headers Policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `${props.projectName}-${props.environment}-security-headers`,
      comment: `Security headers policy for ${props.projectName} - OWASP Compliant`,
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https: data:; connect-src 'self' https:; media-src 'self' https:; object-src 'none'; frame-src 'self' https:; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; form-action 'self';",
        },
        contentTypeOptions: {
          override: true,
        },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(63072000), // 2 years
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
    });

    // Create ECS Task Definition
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: props.ecsTaskExecutionRole,
      taskRole: props.ecsTaskRole,
      family: `${props.projectName}-${props.environment}-task`,
    });

    // Add container to task definition
    const container = this.taskDefinition.addContainer('Container', {
      image: ecs.ContainerImage.fromRegistry('nginx:latest'), // Placeholder image
      memoryLimitMiB: 512,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'ecs',
        logGroup: ecsLogGroup,
      }),
      containerName: `${props.projectName}-${props.environment}-container`,
      essential: true,
    });

    container.addPortMappings({
      containerPort: 80,
      hostPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // Create ECS Service
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      desiredCount: 2,
      securityGroups: [props.ecsSecurityGroup],
      vpcSubnets: {
        subnets: props.privateSubnets,
      },
      assignPublicIp: false,
      serviceName: `${props.projectName}-${props.environment}-service`,
    });

    // Add target group to service
    this.service.attachToApplicationTargetGroup(targetGroup);

    // Jenkins EC2 Instance (optional - can be created in CICD construct)
    const amazonLinux = ec2.MachineImage.lookup({
      name: 'amzn2-ami-hvm-*-x86_64-gp2',
      owners: ['amazon'],
    });

    // Create Jenkins Instance (optional - if needed here)
    const jenkinsInstance = new ec2.Instance(this, 'JenkinsInstance', {
      vpc: props.vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MEDIUM
      ),
      machineImage: amazonLinux,
      securityGroup: props.jenkinsSecurityGroup,
      vpcSubnets: {
        subnets: [props.publicSubnets[0]],
      },
      keyName: props.keyName,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(30, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'sudo yum update -y',
      'sudo amazon-linux-extras install java-openjdk11 -y',
      'sudo yum install -y jenkins git docker',
      'sudo systemctl start jenkins',
      'sudo systemctl enable jenkins',
      'sudo systemctl start docker',
      'sudo systemctl enable docker',
      'sudo usermod -aG docker jenkins',
      'sudo systemctl restart jenkins'
    );
    jenkinsInstance.addUserData(userData.render());

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}