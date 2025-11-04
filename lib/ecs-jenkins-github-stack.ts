import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NetworkConstruct } from './constructs/network/network-construct';
import { SecurityConstruct } from './constructs/security/security-construct';
import { DatabaseConstruct } from './constructs/database/database-construct';
import { EcsConstruct } from './constructs/ecs/ecs-construct';
import { CicdConstruct } from './constructs/cicd/cicd-construct';
import { MonitoringConstruct } from './constructs/monitoring/monitoring-construct';
import { IamConstruct } from './constructs/iam/iam-construct';
import { Route53Construct } from './constructs/route53/route53-construct';

export interface EcsJenkinsGithubStackProps extends cdk.StackProps {
  awsRegion: string;
  vpcCidr: string;
  publicSubnetCidrs: string[];
  privateSubnetCidrs: string[];
  databaseSubnetCidrs: string[];
  availabilityZones: string[];
  environment: string;
  projectName: string;
  containerPort: number;
  keyName: string;
  jenkinsInstanceType: string;
  jenkinsRoleName: string;
  dbUsername: string;
  dbPassword: string;
  dbName: string;
  grafanaAdminPassword: string;
  domainName: string;
  ec2InstanceType: string;
  minInstanceCount: number;
  maxInstanceCount: number;
  desiredInstanceCount: number;
  useSpotInstances: boolean;
  spotPrice: string;
  
  // OWASP Security settings
  blockedIpAddresses: string[];
  maxRequestSize: number;
  requestLimit: number;
  enableSecurityHub: boolean;
}

export class EcsJenkinsGithubStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsJenkinsGithubStackProps) {
    super(scope, id, props);
  
    // Check for required environment variables
    if (!props.dbUsername || props.dbUsername === '') {
      throw new Error('DB_USERNAME environment variable must be set');
    }
  
    if (!props.dbPassword || props.dbPassword === '') {
      throw new Error('DB_PASSWORD environment variable must be set');
    }
  
    if (!props.grafanaAdminPassword || props.grafanaAdminPassword === '') {
      throw new Error('GRAFANA_ADMIN_PASSWORD environment variable must be set');
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

    // Create IAM roles and policies
    const iam = new IamConstruct(this, 'IAM', {
      environment: props.environment,
      projectName: props.projectName,
      jenkinsRoleName: props.jenkinsRoleName,
    });

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

    // Create ECS resources
    const ecs = new EcsConstruct(this, 'ECS', {
      vpc: network.vpc,
      publicSubnets: network.publicSubnets,
      privateSubnets: network.privateSubnets,
      albSecurityGroup: security.albSecurityGroup,
      ecsSecurityGroup: security.ecsSecurityGroup,
      jenkinsSecurityGroup: security.jenkinsSecurityGroup,
      ecsTaskExecutionRole: iam.ecsTaskExecutionRole,
      ecsTaskRole: iam.ecsTaskRole,
      keyName: props.keyName,
      environment: props.environment,
      projectName: props.projectName,
      containerPort: props.containerPort,
      domainName: props.domainName,
      ec2InstanceType: props.ec2InstanceType,
      minInstanceCount: props.minInstanceCount,
      maxInstanceCount: props.maxInstanceCount,
      desiredInstanceCount: props.desiredInstanceCount,
      useSpotInstances: props.useSpotInstances,
      spotPrice: props.spotPrice,
    });

    // Create CICD resources
    const cicd = new CicdConstruct(this, 'CICD', {
      vpc: network.vpc,
      subnet: network.publicSubnets[0],
      jenkinsSecurityGroup: security.jenkinsSecurityGroup,
      jenkinsRoleName: props.jenkinsRoleName,
      keyName: props.keyName,
      environment: props.environment,
      projectName: props.projectName,
      instanceType: props.jenkinsInstanceType,
    });

    // Create monitoring resources
    const monitoring = new MonitoringConstruct(this, 'Monitoring', {
      vpc: network.vpc,
      environment: props.environment,
      projectName: props.projectName,
      grafanaAdminPassword: props.grafanaAdminPassword,
    });

    // Create Route53 resources (if needed)
    const route53 = new Route53Construct(this, 'Route53', {
      domainName: props.domainName,
      environment: props.environment,
      projectName: props.projectName,
      loadBalancerDnsName: ecs.loadBalancer.loadBalancerDnsName,
      loadBalancerCanonicalHostedZoneId: ecs.loadBalancer.loadBalancerCanonicalHostedZoneId,
    });

    // Export outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: network.vpc.vpcId,
      description: 'The ID of the VPC',
      exportName: `${props.projectName}-${props.environment}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'LoadBalancerDns', {
      value: ecs.loadBalancer.loadBalancerDnsName,
      description: 'The DNS name of the load balancer',
      exportName: `${props.projectName}-${props.environment}-lb-dns`,
    });

    new cdk.CfnOutput(this, 'JenkinsUrl', {
      value: `http://${cicd.jenkinsLoadBalancer.loadBalancerDnsName}`,
      description: 'URL for Jenkins',
      exportName: `${props.projectName}-${props.environment}-jenkins-url`,
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: database.dbInstance.dbInstanceEndpointAddress,
      description: 'Endpoint of the database',
      exportName: `${props.projectName}-${props.environment}-db-endpoint`,
    });
  }
}