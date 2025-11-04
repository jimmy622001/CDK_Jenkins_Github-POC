import * as cdk from 'aws-cdk-lib';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DatabaseConstructProps {
  vpc: ec2.IVpc;
  databaseSubnets: ec2.ISubnet[];
  dbSecurityGroup: ec2.ISecurityGroup;
  environment: string;
  projectName: string;
  dbUsername: string;
  dbPassword: string;
  dbName: string;
}

export class DatabaseConstruct extends Construct {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSubnetGroup: rds.SubnetGroup;

  constructor(scope: Construct, id: string, props: DatabaseConstructProps) {
    super(scope, id);

    // Create a subnet group for the RDS instance
    this.dbSubnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      description: 'DB Subnet Group',
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.databaseSubnets,
      },
    });

    // Create IAM role for monitoring
    const monitoringRole = new iam.Role(this, 'RdsMonitoringRole', {
      assumedBy: new iam.ServicePrincipal('monitoring.rds.amazonaws.com'),
    });

    monitoringRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonRDSEnhancedMonitoringRole')
    );

    // Create parameter group for the RDS instance
    const parameterGroup = new rds.ParameterGroup(this, 'DbParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_13,
      }),
      parameters: {
        'rds.force_ssl': '1',
      },
    });

    // Create the RDS instance
    this.dbInstance = new rds.DatabaseInstance(this, 'DbInstance', {
      instanceIdentifier: 'db-instance',
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_13,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: {
        subnets: props.databaseSubnets,
      },
      securityGroups: [props.dbSecurityGroup],
      credentials: rds.Credentials.fromPassword(
        props.dbUsername,
        cdk.SecretValue.unsafePlainText(props.dbPassword) // Note: In production, use SecretsManager
      ),
      databaseName: props.dbName,
      parameterGroup: parameterGroup,
      subnetGroup: this.dbSubnetGroup,
      allocatedStorage: 20,
      storageType: rds.StorageType.GP2,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: true,
      monitoringInterval: cdk.Duration.seconds(60),
      monitoringRole: monitoringRole,
      autoMinorVersionUpgrade: true,
      iamAuthentication: true,
      publiclyAccessible: false,
      storageEncrypted: true,
      multiAz: true,
      enablePerformanceInsights: true,
      cloudwatchLogsExports: ['postgresql', 'upgrade'],
      copyTagsToSnapshot: true,
    });

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}