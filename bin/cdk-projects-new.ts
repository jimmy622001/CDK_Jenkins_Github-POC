#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import * as dotenv from 'dotenv';
import { devConfig, prodConfig, drConfig } from '../lib/constructs/config/environment-config';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { ApplicationStack } from '../lib/application-stack';

// Load environment variables from .env file
dotenv.config();

const app = new cdk.App();

// Apply cdk-nag to the entire application
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Dev environment
const devInfraStack = new InfrastructureStack(app, 'EcsJenkinsGithubDevInfrastructureStack', {
  awsRegion: devConfig.awsRegion,
  vpcCidr: devConfig.vpcCidr,
  publicSubnetCidrs: devConfig.publicSubnetCidrs,
  privateSubnetCidrs: devConfig.privateSubnetCidrs,
  databaseSubnetCidrs: devConfig.databaseSubnetCidrs,
  availabilityZones: devConfig.availabilityZones,
  environment: devConfig.environment,
  projectName: 'ecs-jenkins',
  dbUsername: process.env.DB_USERNAME || '',
  dbPassword: process.env.DB_PASSWORD || '',
  dbName: 'devappdb',
  domainName: devConfig.domainName,
  blockedIpAddresses: devConfig.blockedIpAddresses,
  maxRequestSize: devConfig.maxRequestSize,
  requestLimit: devConfig.requestLimit,
  enableSecurityHub: devConfig.enableSecurityHub,
  jenkinsRoleName: devConfig.jenkinsRoleName,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: devConfig.awsRegion,
  },
  description: 'ECS Jenkins Infrastructure - Dev Environment',
  tags: devConfig.tags,
});

// Dev Application Stack - depends on Infrastructure Stack
const devAppStack = new ApplicationStack(app, 'EcsJenkinsGithubDevApplicationStack', {
  // References to infrastructure resources
  vpcId: devInfraStack.vpc.vpcId,
  publicSubnetIds: devInfraStack.publicSubnets.map(subnet => subnet.subnetId),
  privateSubnetIds: devInfraStack.privateSubnets.map(subnet => subnet.subnetId),
  albSecurityGroupId: devInfraStack.albSecurityGroup.securityGroupId,
  ecsSecurityGroupId: devInfraStack.ecsSecurityGroup.securityGroupId,
  jenkinsSecurityGroupId: devInfraStack.jenkinsSecurityGroup.securityGroupId,
  ecsTaskExecutionRoleArn: devInfraStack.ecsTaskExecutionRole.roleArn,
  ecsTaskRoleArn: devInfraStack.ecsTaskRole.roleArn,
  dbEndpoint: devInfraStack.dbInstance.dbInstanceEndpointAddress,

  // Application configuration
  awsRegion: devConfig.awsRegion,
  environment: devConfig.environment,
  projectName: 'ecs-jenkins',
  containerPort: devConfig.containerPort,
  keyName: devConfig.keyName,
  jenkinsInstanceType: devConfig.jenkinsInstanceType,
  jenkinsRoleName: devConfig.jenkinsRoleName,
  grafanaAdminPassword: process.env.GRAFANA_ADMIN_PASSWORD || '',
  domainName: devConfig.domainName,
  ec2InstanceType: devConfig.instanceType.toString(),
  minInstanceCount: devConfig.minInstanceCount,
  maxInstanceCount: devConfig.maxInstanceCount,
  desiredInstanceCount: devConfig.desiredInstanceCount,
  useSpotInstances: devConfig.useSpotInstances,
  spotPrice: devConfig.spotPrice,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: devConfig.awsRegion,
  },
  description: 'ECS Jenkins Application - Dev Environment',
  tags: devConfig.tags,
});

// Set dependency to ensure infrastructure is deployed first
devAppStack.addDependency(devInfraStack);

// Prod environment
const prodInfraStack = new InfrastructureStack(app, 'EcsJenkinsGithubProdInfrastructureStack', {
  awsRegion: prodConfig.awsRegion,
  vpcCidr: prodConfig.vpcCidr,
  publicSubnetCidrs: prodConfig.publicSubnetCidrs,
  privateSubnetCidrs: prodConfig.privateSubnetCidrs,
  databaseSubnetCidrs: prodConfig.databaseSubnetCidrs,
  availabilityZones: prodConfig.availabilityZones,
  environment: prodConfig.environment,
  projectName: 'ecs-jenkins',
  dbUsername: process.env.PROD_DB_USERNAME || '',
  dbPassword: process.env.PROD_DB_PASSWORD || '',
  dbName: 'prodappdb',
  domainName: prodConfig.domainName,
  blockedIpAddresses: prodConfig.blockedIpAddresses,
  maxRequestSize: prodConfig.maxRequestSize,
  requestLimit: prodConfig.requestLimit,
  enableSecurityHub: prodConfig.enableSecurityHub,
  jenkinsRoleName: prodConfig.jenkinsRoleName,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: prodConfig.awsRegion,
  },
  description: 'ECS Jenkins Infrastructure - Production Environment',
  tags: prodConfig.tags,
});

// Prod Application Stack
const prodAppStack = new ApplicationStack(app, 'EcsJenkinsGithubProdApplicationStack', {
  // References to infrastructure resources
  vpcId: prodInfraStack.vpc.vpcId,
  publicSubnetIds: prodInfraStack.publicSubnets.map(subnet => subnet.subnetId),
  privateSubnetIds: prodInfraStack.privateSubnets.map(subnet => subnet.subnetId),
  albSecurityGroupId: prodInfraStack.albSecurityGroup.securityGroupId,
  ecsSecurityGroupId: prodInfraStack.ecsSecurityGroup.securityGroupId,
  jenkinsSecurityGroupId: prodInfraStack.jenkinsSecurityGroup.securityGroupId,
  ecsTaskExecutionRoleArn: prodInfraStack.ecsTaskExecutionRole.roleArn,
  ecsTaskRoleArn: prodInfraStack.ecsTaskRole.roleArn,
  dbEndpoint: prodInfraStack.dbInstance.dbInstanceEndpointAddress,

  // Application configuration
  awsRegion: prodConfig.awsRegion,
  environment: prodConfig.environment,
  projectName: 'ecs-jenkins',
  containerPort: prodConfig.containerPort,
  keyName: prodConfig.keyName,
  jenkinsInstanceType: prodConfig.jenkinsInstanceType,
  jenkinsRoleName: prodConfig.jenkinsRoleName,
  grafanaAdminPassword: process.env.PROD_GRAFANA_ADMIN_PASSWORD || '',
  domainName: prodConfig.domainName,
  ec2InstanceType: prodConfig.instanceType.toString(),
  minInstanceCount: prodConfig.minInstanceCount,
  maxInstanceCount: prodConfig.maxInstanceCount,
  desiredInstanceCount: prodConfig.desiredInstanceCount,
  useSpotInstances: prodConfig.useSpotInstances,
  spotPrice: prodConfig.spotPrice,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: prodConfig.awsRegion,
  },
  description: 'ECS Jenkins Application - Production Environment',
  tags: prodConfig.tags,
});

// Set dependency to ensure infrastructure is deployed first
prodAppStack.addDependency(prodInfraStack);

// DR environment
const drInfraStack = new InfrastructureStack(app, 'EcsJenkinsGithubDrInfrastructureStack', {
  awsRegion: drConfig.awsRegion,
  vpcCidr: drConfig.vpcCidr,
  publicSubnetCidrs: drConfig.publicSubnetCidrs,
  privateSubnetCidrs: drConfig.privateSubnetCidrs,
  databaseSubnetCidrs: drConfig.databaseSubnetCidrs,
  availabilityZones: drConfig.availabilityZones,
  environment: drConfig.environment,
  projectName: 'ecs-jenkins',
  dbUsername: process.env.DR_DB_USERNAME || '',
  dbPassword: process.env.DR_DB_PASSWORD || '',
  dbName: 'drappdb',
  domainName: drConfig.domainName,
  blockedIpAddresses: drConfig.blockedIpAddresses,
  maxRequestSize: drConfig.maxRequestSize,
  requestLimit: drConfig.requestLimit,
  enableSecurityHub: drConfig.enableSecurityHub,
  jenkinsRoleName: drConfig.jenkinsRoleName,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: drConfig.awsRegion,
  },
  description: 'ECS Jenkins Infrastructure - DR Environment',
  tags: drConfig.tags,
});

// DR Application Stack
const drAppStack = new ApplicationStack(app, 'EcsJenkinsGithubDrApplicationStack', {
  // References to infrastructure resources
  vpcId: drInfraStack.vpc.vpcId,
  publicSubnetIds: drInfraStack.publicSubnets.map(subnet => subnet.subnetId),
  privateSubnetIds: drInfraStack.privateSubnets.map(subnet => subnet.subnetId),
  albSecurityGroupId: drInfraStack.albSecurityGroup.securityGroupId,
  ecsSecurityGroupId: drInfraStack.ecsSecurityGroup.securityGroupId,
  jenkinsSecurityGroupId: drInfraStack.jenkinsSecurityGroup.securityGroupId,
  ecsTaskExecutionRoleArn: drInfraStack.ecsTaskExecutionRole.roleArn,
  ecsTaskRoleArn: drInfraStack.ecsTaskRole.roleArn,
  dbEndpoint: drInfraStack.dbInstance.dbInstanceEndpointAddress,

  // Application configuration
  awsRegion: drConfig.awsRegion,
  environment: drConfig.environment,
  projectName: 'ecs-jenkins',
  containerPort: drConfig.containerPort,
  keyName: drConfig.keyName,
  jenkinsInstanceType: drConfig.jenkinsInstanceType,
  jenkinsRoleName: drConfig.jenkinsRoleName,
  grafanaAdminPassword: process.env.DR_GRAFANA_ADMIN_PASSWORD || '',
  domainName: drConfig.domainName,
  ec2InstanceType: drConfig.instanceType.toString(),
  minInstanceCount: drConfig.minInstanceCount,
  maxInstanceCount: drConfig.maxInstanceCount,
  desiredInstanceCount: drConfig.desiredInstanceCount,
  useSpotInstances: drConfig.useSpotInstances,
  spotPrice: drConfig.spotPrice,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: drConfig.awsRegion,
  },
  description: 'ECS Jenkins Application - DR Environment',
  tags: drConfig.tags,
});

// Set dependency to ensure infrastructure is deployed first
drAppStack.addDependency(drInfraStack);

// Add suppressions for security warnings across stacks
for (const stack of [
  devInfraStack, devAppStack,
  prodInfraStack, prodAppStack,
  drInfraStack, drAppStack
]) {
  NagSuppressions.addStackSuppressions(stack, [
    { id: 'AwsSolutions-IAM4', reason: 'Using managed policies for demo purposes' },
    { id: 'AwsSolutions-IAM5', reason: 'Using wildcards in IAM policies for demo purposes' },
    { id: 'AwsSolutions-RDS3', reason: 'Using password authentication for demonstration purposes' },
    { id: 'AwsSolutions-EC23', reason: 'Using SSH key pairs for ease of demonstration' },
  ]);
}