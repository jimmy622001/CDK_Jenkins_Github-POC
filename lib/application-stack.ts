import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EcsConstruct } from './constructs/ecs/ecs-construct';
import { CicdConstruct } from './constructs/cicd/cicd-construct';
import { MonitoringConstruct } from './constructs/monitoring/monitoring-construct';
import { Route53Construct } from './constructs/route53/route53-construct';

export interface ApplicationStackProps extends cdk.StackProps {
  // Infrastructure references
  vpcId: string;
  publicSubnetIds: string[];
  privateSubnetIds: string[];
  albSecurityGroupId: string;
  ecsSecurityGroupId: string;
  jenkinsSecurityGroupId: string;
  ecsTaskExecutionRoleArn: string;
  ecsTaskRoleArn: string;
  dbEndpoint: string;
  
  // Application-specific properties
  awsRegion: string;
  environment: string;
  projectName: string;
  containerPort: number;
  keyName: string;
  jenkinsInstanceType: string;
  jenkinsRoleName: string;
  grafanaAdminPassword: string;
  domainName: string;
  ec2InstanceType: string;
  minInstanceCount: number;
  maxInstanceCount: number;
  desiredInstanceCount: number;
  useSpotInstances: boolean;
  spotPrice: string;
}

export class ApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApplicationStackProps) {
    super(scope, id, props);
  
    // Check for required environment variables
    if (!props.grafanaAdminPassword || props.grafanaAdminPassword === '') {
      throw new Error('GRAFANA_ADMIN_PASSWORD environment variable must be set');
    }
    
    // Import infrastructure resources
    const vpc = cdk.aws_ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId: props.vpcId,
      availabilityZones: this.availabilityZones,
    });
    
    const publicSubnets = props.publicSubnetIds.map((subnetId, index) => {
      return cdk.aws_ec2.Subnet.fromSubnetAttributes(this, `ImportedPublicSubnet${index}`, {
        subnetId: subnetId,
      });
    });
    
    const privateSubnets = props.privateSubnetIds.map((subnetId, index) => {
      return cdk.aws_ec2.Subnet.fromSubnetAttributes(this, `ImportedPrivateSubnet${index}`, {
        subnetId: subnetId,
      });
    });
    
    const albSecurityGroup = cdk.aws_ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedAlbSecurityGroup',
      props.albSecurityGroupId
    );
    
    const ecsSecurityGroup = cdk.aws_ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedEcsSecurityGroup',
      props.ecsSecurityGroupId
    );
    
    const jenkinsSecurityGroup = cdk.aws_ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedJenkinsSecurityGroup',
      props.jenkinsSecurityGroupId
    );
    
    const ecsTaskExecutionRole = cdk.aws_iam.Role.fromRoleArn(
      this,
      'ImportedEcsTaskExecutionRole',
      props.ecsTaskExecutionRoleArn
    );
    
    const ecsTaskRole = cdk.aws_iam.Role.fromRoleArn(
      this,
      'ImportedEcsTaskRole',
      props.ecsTaskRoleArn
    );

    // Create ECS resources
    const ecs = new EcsConstruct(this, 'ECS', {
      vpc: vpc,
      publicSubnets: publicSubnets,
      privateSubnets: privateSubnets,
      albSecurityGroup: albSecurityGroup,
      ecsSecurityGroup: ecsSecurityGroup,
      jenkinsSecurityGroup: jenkinsSecurityGroup,
      ecsTaskExecutionRole: ecsTaskExecutionRole,
      ecsTaskRole: ecsTaskRole,
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
      vpc: vpc,
      subnet: publicSubnets[0],
      jenkinsSecurityGroup: jenkinsSecurityGroup,
      jenkinsRoleName: props.jenkinsRoleName,
      keyName: props.keyName,
      environment: props.environment,
      projectName: props.projectName,
      instanceType: props.jenkinsInstanceType,
    });

    // Create monitoring resources
    const monitoring = new MonitoringConstruct(this, 'Monitoring', {
      vpc: vpc,
      environment: props.environment,
      projectName: props.projectName,
      grafanaAdminPassword: props.grafanaAdminPassword,
    });

    // Update Route53 now that we have the load balancer
    const route53 = new Route53Construct(this, 'Route53', {
      domainName: props.domainName,
      environment: props.environment,
      projectName: props.projectName,
      loadBalancerDnsName: ecs.loadBalancer.loadBalancerDnsName,
      loadBalancerCanonicalHostedZoneId: ecs.loadBalancer.loadBalancerCanonicalHostedZoneId,
    });

    // Export outputs
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
  }
}