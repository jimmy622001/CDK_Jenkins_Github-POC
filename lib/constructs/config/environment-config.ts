import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface EnvironmentConfig {
  // General environment settings
  awsRegion: string;
  environment: string;
  
  // Network settings
  vpcCidr: string;
  publicSubnetCidrs: string[];
  privateSubnetCidrs: string[];
  databaseSubnetCidrs: string[];
  availabilityZones: string[];
  
  // Compute settings
  instanceType: ec2.InstanceType;
  jenkinsInstanceType: string;
  
  // Scaling settings
  minInstanceCount: number;
  maxInstanceCount: number;
  desiredInstanceCount: number;
  useSpotInstances: boolean;
  spotPrice: string;
  
  // Service settings
  containerPort: number;
  keyName: string;
  jenkinsRoleName: string;
  domainName: string;
  
  // Database settings
  dbInstanceClass: string;
  dbMultiAZ: boolean;
  dbBackupRetentionPeriod: number;
  dbAllocatedStorage: number;
  dbMaxAllocatedStorage: number;
  
  // Monitoring settings
  enableDetailedMonitoring: boolean;
  logsRetentionDays: number;
  
  // Security settings
  blockedIpAddresses: string[];
  maxRequestSize: number;
  requestLimit: number;
  enableSecurityHub: boolean;
  
  // Tags
  tags: { [key: string]: string };
}

// Development environment configuration
export const devConfig: EnvironmentConfig = {
  awsRegion: 'us-east-1',
  environment: 'dev',
  
  vpcCidr: '10.0.0.0/16',
  publicSubnetCidrs: ['10.0.1.0/24', '10.0.2.0/24'],
  privateSubnetCidrs: ['10.0.3.0/24', '10.0.4.0/24'],
  databaseSubnetCidrs: ['10.0.5.0/24', '10.0.6.0/24'],
  availabilityZones: ['us-east-1a', 'us-east-1b'],
  
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
  jenkinsInstanceType: 't3.small',
  
  minInstanceCount: 1,
  maxInstanceCount: 3,
  desiredInstanceCount: 1,
  useSpotInstances: true,
  spotPrice: '0.04',
  
  containerPort: 8080,
  keyName: 'dev-key',
  jenkinsRoleName: 'jenkins-role-dev',
  domainName: 'dev.example.com',
  
  dbInstanceClass: 'db.t3.small',
  dbMultiAZ: false,
  dbBackupRetentionPeriod: 7,
  dbAllocatedStorage: 20,
  dbMaxAllocatedStorage: 100,
  
  enableDetailedMonitoring: false,
  logsRetentionDays: 30,
  
  blockedIpAddresses: [],
  maxRequestSize: 131072,  // 128 KB
  requestLimit: 1000,
  enableSecurityHub: false,
  
  tags: {
    Environment: 'dev',
    Project: 'ecs-jenkins',
    ManagedBy: 'CDK',
  },
};

// Production environment configuration
export const prodConfig: EnvironmentConfig = {
  awsRegion: 'us-east-1',
  environment: 'prod',
  
  vpcCidr: '10.1.0.0/16',
  publicSubnetCidrs: ['10.1.1.0/24', '10.1.2.0/24'],
  privateSubnetCidrs: ['10.1.3.0/24', '10.1.4.0/24'],
  databaseSubnetCidrs: ['10.1.5.0/24', '10.1.6.0/24'],
  availabilityZones: ['us-east-1a', 'us-east-1b'],
  
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
  jenkinsInstanceType: 't3.medium',
  
  minInstanceCount: 2,
  maxInstanceCount: 10,
  desiredInstanceCount: 4,
  useSpotInstances: false,
  spotPrice: '0.00',
  
  containerPort: 8080,
  keyName: 'prod-key',
  jenkinsRoleName: 'jenkins-role-prod',
  domainName: 'example.com',
  
  dbInstanceClass: 'db.m5.large',
  dbMultiAZ: true,
  dbBackupRetentionPeriod: 30,
  dbAllocatedStorage: 50,
  dbMaxAllocatedStorage: 500,
  
  enableDetailedMonitoring: true,
  logsRetentionDays: 90,
  
  blockedIpAddresses: [],
  maxRequestSize: 131072,  // 128 KB
  requestLimit: 5000,
  enableSecurityHub: true,
  
  tags: {
    Environment: 'prod',
    Project: 'ecs-jenkins',
    ManagedBy: 'CDK',
  },
};

// Disaster Recovery (DR) environment configuration - Pilot Light in West Region
export const drConfig: EnvironmentConfig = {
  awsRegion: 'us-west-2', // West Coast Region for DR
  environment: 'dr',
  
  vpcCidr: '10.2.0.0/16',
  publicSubnetCidrs: ['10.2.1.0/24', '10.2.2.0/24'],
  privateSubnetCidrs: ['10.2.3.0/24', '10.2.4.0/24'],
  databaseSubnetCidrs: ['10.2.5.0/24', '10.2.6.0/24'],
  availabilityZones: ['us-west-2a', 'us-west-2b'], // West coast availability zones
  
  instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
  jenkinsInstanceType: 't3.small',
  
  minInstanceCount: 1,
  maxInstanceCount: 10, // Can scale up to match production if needed
  desiredInstanceCount: 1, // Pilot light mode - minimal resources running
  useSpotInstances: false, // No spot instances for DR to ensure reliability
  spotPrice: '0.00',
  
  containerPort: 8080,
  keyName: 'dr-key',
  jenkinsRoleName: 'jenkins-role-dr',
  domainName: 'dr-ecs-jenkins.example.com',
  
  dbInstanceClass: 'db.t3.small', // Smaller instance for pilot light mode
  dbMultiAZ: false, // Single AZ to reduce costs during pilot light mode
  dbBackupRetentionPeriod: 30,
  dbAllocatedStorage: 50, // Same as prod to ensure capacity for failover
  dbMaxAllocatedStorage: 500, // Same as prod
  
  enableDetailedMonitoring: true,
  logsRetentionDays: 90,
  
  blockedIpAddresses: [],
  maxRequestSize: 131072,  // 128 KB
  requestLimit: 5000,
  enableSecurityHub: true,
  
  tags: {
    Environment: 'dr',
    Project: 'ecs-jenkins',
    ManagedBy: 'CDK',
    DisasterRecovery: 'PilotLight',
  },
};