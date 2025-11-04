import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface MonitoringConstructProps {
  vpc: ec2.IVpc;
  environment: string;
  projectName: string;
  grafanaAdminPassword: string;
}

export class MonitoringConstruct extends Construct {
  public readonly prometheusTaskDefinition: ecs.TaskDefinition;
  public readonly grafanaTaskDefinition: ecs.TaskDefinition;
  public readonly grafanaService: ecs.FargateService;
  public readonly prometheusService: ecs.FargateService;
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id);

    // Security Group for monitoring services
    const monitoringSecurityGroup = new ec2.SecurityGroup(this, 'MonitoringSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for monitoring services',
      allowAllOutbound: true,
    });

    monitoringSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(9090),
      'Allow Prometheus access from within VPC'
    );

    monitoringSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(3000),
      'Allow Grafana access from within VPC'
    );

    // IAM Role for monitoring services
    const monitoringTaskRole = new iam.Role(this, 'MonitoringTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    monitoringTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudwatch:ListMetrics',
          'cloudwatch:GetMetricStatistics',
          'cloudwatch:GetMetricData',
          'ec2:DescribeInstances',
          'ec2:DescribeVolumes',
          'ecs:ListClusters',
          'ecs:ListServices',
          'ecs:ListTasks',
          'ecs:DescribeClusters',
          'ecs:DescribeServices',
          'ecs:DescribeTasks',
        ],
        resources: ['*'],
      })
    );

    const monitoringExecutionRole = new iam.Role(this, 'MonitoringExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    monitoringExecutionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')
    );

    // Create CloudWatch Logs for Prometheus and Grafana
    const prometheusLogGroup = new logs.LogGroup(this, 'PrometheusLogs', {
      logGroupName: `/ecs/${props.projectName}-${props.environment}-prometheus`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const grafanaLogGroup = new logs.LogGroup(this, 'GrafanaLogs', {
      logGroupName: `/ecs/${props.projectName}-${props.environment}-grafana`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create ECS Cluster if it doesn't exist
    const monitoringCluster = new ecs.Cluster(this, 'MonitoringCluster', {
      vpc: props.vpc,
      containerInsights: true,
      clusterName: `${props.projectName}-${props.environment}-monitoring-cluster`,
    });

    // Create the Prometheus Task Definition
    this.prometheusTaskDefinition = new ecs.FargateTaskDefinition(this, 'PrometheusTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: monitoringExecutionRole,
      taskRole: monitoringTaskRole,
      family: `${props.projectName}-${props.environment}-prometheus`,
    });

    // Add Prometheus container
    const prometheusContainer = this.prometheusTaskDefinition.addContainer('PrometheusContainer', {
      image: ecs.ContainerImage.fromRegistry('prom/prometheus:latest'),
      memoryLimitMiB: 1024,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'prometheus',
        logGroup: prometheusLogGroup,
      }),
      environment: {
        'PROMETHEUS_CONFIG': '/etc/prometheus/prometheus.yml',
      },
      essential: true,
    });

    prometheusContainer.addPortMappings({
      containerPort: 9090,
      hostPort: 9090,
      protocol: ecs.Protocol.TCP,
    });

    // Create the Grafana Task Definition
    this.grafanaTaskDefinition = new ecs.FargateTaskDefinition(this, 'GrafanaTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: monitoringExecutionRole,
      taskRole: monitoringTaskRole,
      family: `${props.projectName}-${props.environment}-grafana`,
    });

    // Add Grafana container
    const grafanaContainer = this.grafanaTaskDefinition.addContainer('GrafanaContainer', {
      image: ecs.ContainerImage.fromRegistry('grafana/grafana:latest'),
      memoryLimitMiB: 1024,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'grafana',
        logGroup: grafanaLogGroup,
      }),
      environment: {
        'GF_SECURITY_ADMIN_PASSWORD': props.grafanaAdminPassword, // Use SSM Parameter in production
        'GF_INSTALL_PLUGINS': 'grafana-clock-panel,grafana-simple-json-datasource',
        'GF_USERS_ALLOW_SIGN_UP': 'false',
      },
      essential: true,
    });

    grafanaContainer.addPortMappings({
      containerPort: 3000,
      hostPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    // Create Prometheus service
    this.prometheusService = new ecs.FargateService(this, 'PrometheusService', {
      cluster: monitoringCluster,
      taskDefinition: this.prometheusTaskDefinition,
      desiredCount: 1,
      securityGroups: [monitoringSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      assignPublicIp: false,
      serviceName: `${props.projectName}-${props.environment}-prometheus`,
    });

    // Create Grafana service
    this.grafanaService = new ecs.FargateService(this, 'GrafanaService', {
      cluster: monitoringCluster,
      taskDefinition: this.grafanaTaskDefinition,
      desiredCount: 1,
      securityGroups: [monitoringSecurityGroup],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      assignPublicIp: false,
      serviceName: `${props.projectName}-${props.environment}-grafana`,
    });

    // Create SNS Topic for monitoring alerts
    this.alertTopic = new sns.Topic(this, 'MonitoringAlertTopic', {
      topicName: `${props.projectName}-${props.environment}-monitoring-alerts`,
    });

    // Create CloudWatch Dashboard for monitoring
    const dashboard = new cloudwatch.Dashboard(this, 'MonitoringDashboard', {
      dashboardName: `${props.projectName}-${props.environment}-monitoring-dashboard`,
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'CPU Utilization',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              ClusterName: monitoringCluster.clusterName,
              ServiceName: this.prometheusService.serviceName,
            },
            period: cdk.Duration.minutes(1),
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'CPUUtilization',
            dimensionsMap: {
              ClusterName: monitoringCluster.clusterName,
              ServiceName: this.grafanaService.serviceName,
            },
            period: cdk.Duration.minutes(1),
            statistic: 'Average',
          }),
        ],
      }),

      new cloudwatch.GraphWidget({
        title: 'Memory Utilization',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ClusterName: monitoringCluster.clusterName,
              ServiceName: this.prometheusService.serviceName,
            },
            period: cdk.Duration.minutes(1),
            statistic: 'Average',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ECS',
            metricName: 'MemoryUtilization',
            dimensionsMap: {
              ClusterName: monitoringCluster.clusterName,
              ServiceName: this.grafanaService.serviceName,
            },
            period: cdk.Duration.minutes(1),
            statistic: 'Average',
          }),
        ],
      })
    );

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}