#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { EcsJenkinsGithubStack } from '../lib/ecs-jenkins-github-stack';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';

const app = new cdk.App();

// Apply cdk-nag to the entire application
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Dev environment
const devStack = new EcsJenkinsGithubStack(app, 'EcsJenkinsGithubDevStack', {
  awsRegion: 'us-east-1',
  vpcCidr: '10.0.0.0/16',
  publicSubnetCidrs: ['10.0.1.0/24', '10.0.2.0/24'],
  privateSubnetCidrs: ['10.0.3.0/24', '10.0.4.0/24'],
  databaseSubnetCidrs: ['10.0.5.0/24', '10.0.6.0/24'],
  availabilityZones: ['us-east-1a', 'us-east-1b'],
  environment: 'dev',
  projectName: 'ecs-jenkins',
  containerPort: 8080,
  keyName: 'dev-key',
  jenkinsInstanceType: 't3.small',
  jenkinsRoleName: 'jenkins-role-dev',
  dbUsername: process.env.DB_USERNAME || '', // Must be set through environment variables
  dbPassword: process.env.DB_PASSWORD || '', // Must be set through environment variables or AWS Secrets Manager
  dbName: 'devappdb',
  grafanaAdminPassword: process.env.GRAFANA_ADMIN_PASSWORD || '', // Must be set through environment variables
  domainName: 'dev-ecs-jenkins.example.com',
  ec2InstanceType: 't3.small',
  minInstanceCount: 1,
  maxInstanceCount: 3,
  desiredInstanceCount: 2,
  useSpotInstances: true,
  spotPrice: '0.04',
  
  // OWASP Security settings
  blockedIpAddresses: [],
  maxRequestSize: 131072,  // 128 KB
  requestLimit: 1000,
  enableSecurityHub: false,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ECS Jenkins with GitHub integration - Dev Environment',
  tags: {
    Environment: 'dev',
    Project: 'ecs-jenkins',
    ManagedBy: 'CDK',
  },
});

// Add suppressions for specific rules that might not be applicable in this context
NagSuppressions.addStackSuppressions(devStack, [
  { id: 'AwsSolutions-IAM4', reason: 'Using managed policies for demo purposes' },
  { id: 'AwsSolutions-IAM5', reason: 'Using wildcards in IAM policies for demo purposes' },
  { id: 'AwsSolutions-RDS3', reason: 'Using password authentication for demonstration purposes' },
  { id: 'AwsSolutions-EC23', reason: 'Using SSH key pairs for ease of demonstration' },
]);

// Add other environments as needed:
// Production environment
/*
new EcsJenkinsGithubStack(app, 'EcsJenkinsGithubProdStack', {
  awsRegion: 'us-east-1',
  vpcCidr: '10.1.0.0/16',
  publicSubnetCidrs: ['10.1.1.0/24', '10.1.2.0/24'],
  privateSubnetCidrs: ['10.1.3.0/24', '10.1.4.0/24'],
  databaseSubnetCidrs: ['10.1.5.0/24', '10.1.6.0/24'],
  availabilityZones: ['us-east-1a', 'us-east-1b'],
  environment: 'prod',
  projectName: 'ecs-jenkins',
  containerPort: 8080,
  keyName: 'prod-key',
  jenkinsInstanceType: 't3.medium',
  jenkinsRoleName: 'jenkins-role-prod',
  dbUsername: process.env.PROD_DB_USERNAME || '',
  dbPassword: process.env.PROD_DB_PASSWORD || '',
  dbName: 'prodappdb',
  grafanaAdminPassword: process.env.PROD_GRAFANA_ADMIN_PASSWORD || '',
  domainName: 'example.com',
  ec2InstanceType: 't3.medium',
  minInstanceCount: 2,
  maxInstanceCount: 6,
  desiredInstanceCount: 2,
  useSpotInstances: false,
  spotPrice: '0.00',
  
  // OWASP Security settings
  blockedIpAddresses: [],
  maxRequestSize: 131072,  // 128 KB
  requestLimit: 1000,
  enableSecurityHub: true,

  // Stack properties
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'ECS Jenkins with GitHub integration - Production Environment',
  tags: {
    Environment: 'prod',
    Project: 'ecs-jenkins',
    ManagedBy: 'CDK',
  },
});
*/