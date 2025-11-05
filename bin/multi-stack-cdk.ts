#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import * as dotenv from 'dotenv';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { ClusterStack } from '../lib/cluster-stack';
import { ApplicationStack } from '../lib/application-stack';
import { devConfig, prodConfig, drConfig } from '../lib/constructs/config/environment-config';

// Load environment variables from .env file
dotenv.config();

// Get CLI arguments
const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';
const deployTarget = app.node.tryGetContext('deploy-target') || 'all';
const clusterVersion = app.node.tryGetContext('cluster-version');
const appVersion = app.node.tryGetContext('version') || 'latest';

// Apply cdk-nag to the entire application
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// Get environment configuration based on CLI argument
const getEnvConfig = (env: string) => {
  switch (env) {
    case 'prod':
      return prodConfig;
    case 'dr':
      return drConfig;
    case 'dev':
    default:
      return devConfig;
  }
};

// Determine environment variables based on CLI argument
const getEnvVars = (env: string) => {
  const prefix = env === 'dev' ? '' : `${env.toUpperCase()}_`;
  return {
    dbUsername: process.env[`${prefix}DB_USERNAME`] || '',
    dbPassword: process.env[`${prefix}DB_PASSWORD`] || '',
    grafanaPassword: process.env[`${prefix}GRAFANA_ADMIN_PASSWORD`] || '',
  };
};

// Create stacks based on environment and deployment target
const createStacks = (env: string) => {
  console.log(`Creating stacks for environment: ${env}`);
  console.log(`Deployment target: ${deployTarget}`);
  
  const config = getEnvConfig(env);
  const envVars = getEnvVars(env);
  const stackNamePrefix = 'EcsJenkins';
  const stackSuffix = env.charAt(0).toUpperCase() + env.slice(1);
  
  // Create infrastructure stack if needed
  let infraStack;
  if (deployTarget === 'all' || deployTarget === 'infra') {
    infraStack = new InfrastructureStack(app, `${stackNamePrefix}Infra${stackSuffix}Stack`, {
      environmentConfig: config,
      dbUsername: envVars.dbUsername,
      dbPassword: envVars.dbPassword,
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: config.awsRegion,
      },
      description: `ECS Jenkins Infrastructure - ${stackSuffix} Environment`,
      tags: { ...config.tags, Component: 'Infrastructure' },
    });
    
    // Add suppressions specific to infrastructure
    NagSuppressions.addStackSuppressions(infraStack, [
      { id: 'AwsSolutions-IAM4', reason: 'Using managed policies for infrastructure' },
      { id: 'AwsSolutions-IAM5', reason: 'Using wildcards in infrastructure IAM policies' },
      { id: 'AwsSolutions-RDS3', reason: 'Using password authentication for database' },
    ]);
  }
  
  // Create cluster stack if needed
  let clusterStack;
  if (deployTarget === 'all' || deployTarget === 'cluster') {
    clusterStack = new ClusterStack(app, `${stackNamePrefix}Cluster${stackSuffix}Stack`, {
      environmentConfig: config,
      vpcId: cdk.Fn.importValue(`${config.appName}-${config.envName}-vpc-id`),
      clusterVersion: clusterVersion,
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: config.awsRegion,
      },
      description: `ECS Jenkins Cluster - ${stackSuffix} Environment`,
      tags: { ...config.tags, Component: 'Cluster' },
    });
    
    // Add dependency on infrastructure stack if both are being deployed
    if (infraStack) {
      clusterStack.addDependency(infraStack);
    }
    
    // Add suppressions specific to cluster
    NagSuppressions.addStackSuppressions(clusterStack, [
      { id: 'AwsSolutions-IAM4', reason: 'Using managed policies for ECS cluster' },
      { id: 'AwsSolutions-IAM5', reason: 'Using wildcards in ECS IAM policies' },
    ]);
  }
  
  // Create application stack if needed
  if (deployTarget === 'all' || deployTarget === 'app') {
    const appStack = new ApplicationStack(app, `${stackNamePrefix}App${stackSuffix}Stack`, {
      environmentConfig: config,
      vpcId: cdk.Fn.importValue(`${config.appName}-${config.envName}-vpc-id`),
      clusterName: cdk.Fn.importValue(`${config.appName}-${config.envName}-cluster-name`),
      applicationVersion: appVersion,
      grafanaAdminPassword: envVars.grafanaPassword,
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: config.awsRegion,
      },
      description: `ECS Jenkins Application - ${stackSuffix} Environment`,
      tags: { ...config.tags, Component: 'Application' },
    });
    
    // Add dependency on cluster stack if it's being deployed
    if (clusterStack) {
      appStack.addDependency(clusterStack);
    }
    
    // Add suppressions specific to application
    NagSuppressions.addStackSuppressions(appStack, [
      { id: 'AwsSolutions-IAM4', reason: 'Using managed policies for application services' },
      { id: 'AwsSolutions-IAM5', reason: 'Using wildcards in application IAM policies' },
      { id: 'AwsSolutions-EC23', reason: 'Using SSH key pairs for management access' },
    ]);
  }
};

// Create stacks for the specified environment
createStacks(env);

// Log deployment information
console.log('==================================');
console.log(`Environment: ${env}`);
console.log(`Deploy Target: ${deployTarget}`);
if (clusterVersion) {
  console.log(`Cluster Version: ${clusterVersion}`);
}
if (deployTarget === 'app' || deployTarget === 'all') {
  console.log(`Application Version: ${appVersion}`);
}
console.log('==================================');