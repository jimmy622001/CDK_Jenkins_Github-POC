import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IamConstructProps {
  environment: string;
  projectName: string;
  jenkinsRoleName: string;
}

export class IamConstruct extends Construct {
  public readonly ecsTaskExecutionRole: iam.Role;
  public readonly ecsTaskRole: iam.Role;
  public readonly jenkinsRole: iam.Role;

  constructor(scope: Construct, id: string, props: IamConstructProps) {
    super(scope, id);

    // Create ECS Task Execution Role
    this.ecsTaskExecutionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      roleName: `${props.projectName}-${props.environment}-ecs-task-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Add permissions to access ECR, CloudWatch Logs
    this.ecsTaskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      })
    );

    // Create ECS Task Role
    this.ecsTaskRole = new iam.Role(this, 'EcsTaskRole', {
      roleName: `${props.projectName}-${props.environment}-ecs-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Add permissions for the containerized application
    this.ecsTaskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:ListBucket',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'ssm:GetParameters',
          'ssm:GetParameter',
          'kms:Decrypt',
        ],
        resources: ['*'], // Restrict as needed in a real-world scenario
      })
    );

    // Create Jenkins Role
    this.jenkinsRole = new iam.Role(this, 'JenkinsRole', {
      roleName: props.jenkinsRoleName,
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Add permissions for Jenkins to interact with AWS services
    this.jenkinsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ec2:Describe*',
          'elasticloadbalancing:Describe*',
          'autoscaling:Describe*',
          'cloudwatch:GetMetricStatistics',
          'cloudwatch:Describe*',
          'cloudwatch:ListMetrics',
          'logs:Describe*',
          'logs:Get*',
          'logs:List*',
          'logs:StartQuery',
          'logs:StopQuery',
          'logs:TestMetricFilter',
          'logs:FilterLogEvents',
        ],
        resources: ['*'],
      })
    );

    // Add ECS deployment permissions for Jenkins
    this.jenkinsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecs:ListClusters',
          'ecs:DescribeClusters',
          'ecs:ListTaskDefinitions',
          'ecs:DescribeTaskDefinition',
          'ecs:ListServices',
          'ecs:DescribeServices',
          'ecs:UpdateService',
          'ecs:RegisterTaskDefinition',
          'iam:PassRole',
        ],
        resources: ['*'],
      })
    );

    // Add S3 permissions for artifact storage
    this.jenkinsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetObject',
          's3:PutObject',
          's3:ListBucket',
        ],
        resources: ['*'],
      })
    );

    // Add ECR permissions for Docker image management
    this.jenkinsRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
          'ecr:PutImage',
        ],
        resources: ['*'],
      })
    );

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}