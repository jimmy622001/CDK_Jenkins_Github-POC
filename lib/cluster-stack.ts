import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { EnvironmentConfig } from './constructs/config/environment-config';

export interface ClusterStackProps extends cdk.StackProps {
  environmentConfig: EnvironmentConfig;
  vpcId: string;
  clusterVersion?: string; // Optional ECS/EKS version parameter
}

export class ClusterStack extends cdk.Stack {
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: ClusterStackProps) {
    super(scope, id, props);

    const { environmentConfig, vpcId, clusterVersion } = props;
    
    // Import VPC from infrastructure stack
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId
    });

    // ECS Cluster with Container Insights enabled for production and DR
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `${environmentConfig.appName}-${environmentConfig.envName}`,
      containerInsights: environmentConfig.envName !== 'dev', // Enable insights for prod and dr
    });

    // Add capacity provider strategy based on environment
    if (environmentConfig.useSpotInstances) {
      // For dev, we use FARGATE_SPOT to save costs
      this.cluster.addDefaultCapacityProviderStrategy([
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 4,
        },
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        }
      ]);
    } else {
      // For prod and dr, we prioritize FARGATE for stability
      this.cluster.addDefaultCapacityProviderStrategy([
        {
          capacityProvider: 'FARGATE',
          weight: 3,
        },
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1, // Small portion of spot for non-critical workloads
        }
      ]);
    }

    // Create task execution role that will be used by all services in this cluster
    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Create CloudWatch log group for cluster
    const logGroup = new logs.LogGroup(this, 'ClusterLogs', {
      logGroupName: `/ecs/${environmentConfig.appName}-${environmentConfig.envName}-cluster`,
      retention: environmentConfig.envName === 'dev' ? logs.RetentionDays.ONE_WEEK : logs.RetentionDays.ONE_MONTH,
      removalPolicy: environmentConfig.envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Setup cluster monitoring
    this.setupClusterMonitoring();

    // Export cluster ARN and name for use in application stack
    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      exportName: `${environmentConfig.appName}-${environmentConfig.envName}-cluster-arn`,
    });
    
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: `${environmentConfig.appName}-${environmentConfig.envName}-cluster-name`,
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      exportName: `${environmentConfig.appName}-${environmentConfig.envName}-log-group`,
    });
    
    new cdk.CfnOutput(this, 'TaskExecutionRoleArn', {
      value: taskExecutionRole.roleArn,
      exportName: `${environmentConfig.appName}-${environmentConfig.envName}-task-execution-role-arn`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Environment', environmentConfig.envName);
    cdk.Tags.of(this).add('Application', environmentConfig.appName);
    cdk.Tags.of(this).add('Component', 'Cluster');
    if (clusterVersion) {
      cdk.Tags.of(this).add('ClusterVersion', clusterVersion);
    }
  }

  private setupClusterMonitoring(): void {
    // Create CloudWatch dashboard for cluster metrics
    const dashboard = new cloudwatch.Dashboard(this, 'ClusterDashboard', {
      dashboardName: `${this.cluster.clusterName}-dashboard`,
    });

    // Add CPU and memory utilization widgets
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cluster CPU Utilization',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              ClusterName: this.cluster.clusterName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
      }),
      
      new cloudwatch.GraphWidget({
        title: 'Cluster Memory Utilization',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ClusterName: this.cluster.clusterName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
      })
    );

    // Add capacity metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Running Tasks',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'RunningTaskCount',
            dimensionsMap: {
              ClusterName: this.cluster.clusterName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
      }),
      
      new cloudwatch.GraphWidget({
        title: 'Service Count',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'ServiceCount',
            dimensionsMap: {
              ClusterName: this.cluster.clusterName,
            },
            statistic: 'Average',
            period: cdk.Duration.minutes(1),
          }),
        ],
        width: 12,
      })
    );

    // Critical alarm for cluster-wide issues
    new cloudwatch.Alarm(this, 'ClusterCPUAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ECS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          ClusterName: this.cluster.clusterName,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 85,
      evaluationPeriods: 3,
      datapointsToAlarm: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      alarmDescription: 'Cluster CPU utilization is too high',
    });
  }
}