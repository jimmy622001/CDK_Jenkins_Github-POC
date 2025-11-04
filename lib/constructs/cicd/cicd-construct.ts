import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface CicdConstructProps {
  vpc: ec2.IVpc;
  subnet: ec2.ISubnet;
  jenkinsSecurityGroup: ec2.ISecurityGroup;
  jenkinsRoleName: string;
  keyName: string;
  environment: string;
  projectName: string;
  instanceType: string;
}

export class CicdConstruct extends Construct {
  public readonly jenkinsLoadBalancer: elbv2.NetworkLoadBalancer;
  public readonly jenkinsAutoScalingGroup: autoscaling.AutoScalingGroup;

  constructor(scope: Construct, id: string, props: CicdConstructProps) {
    super(scope, id);

    // Get the Jenkins IAM role (assumed to be created by IAM construct)
    const jenkinsRole = iam.Role.fromRoleName(this, 'JenkinsRole', props.jenkinsRoleName);

    // Create an instance profile for Jenkins
    const jenkinsInstanceProfile = new iam.CfnInstanceProfile(this, 'JenkinsInstanceProfile', {
      instanceProfileName: `${props.projectName}-${props.environment}-jenkins-profile`,
      roles: [props.jenkinsRoleName],
    });

    // Amazon Linux 2 AMI
    const amazonLinux = ec2.MachineImage.lookup({
      name: 'amzn2-ami-hvm-*-x86_64-gp2',
      owners: ['amazon'],
    });

    // User data for Jenkins setup
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'sudo yum update -y',
      'sudo amazon-linux-extras install java-openjdk11 -y',
      'sudo yum install -y jenkins git docker',
      'sudo systemctl start jenkins',
      'sudo systemctl enable jenkins',
      'sudo systemctl start docker',
      'sudo systemctl enable docker',
      'sudo usermod -aG docker jenkins',
      'sudo systemctl restart jenkins',
      '',
      '# Install AWS CLI',
      'curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"',
      'unzip awscliv2.zip',
      'sudo ./aws/install',
      '',
      '# Install Terraform',
      'TERRAFORM_VERSION="1.0.0"',
      'wget https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip',
      'unzip terraform_${TERRAFORM_VERSION}_linux_amd64.zip',
      'sudo mv terraform /usr/local/bin/',
      '',
      '# Install SSM Agent',
      'sudo yum install -y https://s3.amazonaws.com/ec2-downloads-windows/SSMAgent/latest/linux_amd64/amazon-ssm-agent.rpm',
      'sudo systemctl enable amazon-ssm-agent',
      'sudo systemctl start amazon-ssm-agent'
    );

    // Create Launch Template for Jenkins
    const launchTemplate = new ec2.CfnLaunchTemplate(this, 'JenkinsLaunchTemplate', {
      launchTemplateName: `${props.projectName}-${props.environment}-jenkins`,
      versionDescription: 'Initial version',
      launchTemplateData: {
        imageId: amazonLinux.getImage(this).imageId,
        instanceType: props.instanceType,
        keyName: props.keyName,
        userData: cdk.Fn.base64(userData.render()),
        securityGroupIds: [props.jenkinsSecurityGroup.securityGroupId],
        iamInstanceProfile: {
          name: jenkinsInstanceProfile.ref,
        },
        blockDeviceMappings: [
          {
            deviceName: '/dev/xvda',
            ebs: {
              volumeSize: 30,
              volumeType: 'gp3',
              deleteOnTermination: true,
              encrypted: true,
            },
          },
        ],
        metadataOptions: {
          httpEndpoint: 'enabled',
          httpTokens: 'required',   // IMDSv2 required for better security
          httpPutResponseHopLimit: 1,
        },
        monitoring: {
          enabled: true,
        },
        tagSpecifications: [
          {
            resourceType: 'instance',
            tags: [
              {
                key: 'Name',
                value: `${props.projectName}-${props.environment}-jenkins`,
              },
              {
                key: 'Environment',
                value: props.environment,
              },
              {
                key: 'Project',
                value: props.projectName,
              },
              {
                key: 'ManagedBy',
                value: 'CDK',
              },
            ],
          },
          {
            resourceType: 'volume',
            tags: [
              {
                key: 'Name',
                value: `${props.projectName}-${props.environment}-jenkins-volume`,
              },
              {
                key: 'Environment',
                value: props.environment,
              },
              {
                key: 'Project',
                value: props.projectName,
              },
            ],
          },
        ],
      },
    });

    // Create Auto Scaling Group for Jenkins
    this.jenkinsAutoScalingGroup = new autoscaling.AutoScalingGroup(this, 'JenkinsASG', {
      vpc: props.vpc,
      vpcSubnets: {
        subnets: [props.subnet],
      },
      minCapacity: 1,
      maxCapacity: 1,
      desiredCapacity: 1,
      instanceType: new ec2.InstanceType(props.instanceType),
      machineImage: amazonLinux,
      keyName: props.keyName,
      securityGroup: props.jenkinsSecurityGroup,
      role: jenkinsRole,
      userData: userData,
      healthCheck: autoscaling.HealthCheck.ec2({
        grace: cdk.Duration.seconds(300),
      }),
      terminationPolicies: [autoscaling.TerminationPolicy.OLDEST_LAUNCH_TEMPLATE],
      updatePolicy: autoscaling.UpdatePolicy.rollingUpdate({
        minInstancesInService: 1,
        pauseTime: cdk.Duration.seconds(300),
      }),
      signals: autoscaling.Signals.waitForMinCapacity({
        timeout: cdk.Duration.minutes(10),
      }),
    });

    // Add tags to Auto Scaling Group
    cdk.Tags.of(this.jenkinsAutoScalingGroup).add('Name', `${props.projectName}-${props.environment}-jenkins`);

    // Create Network Load Balancer for Jenkins
    this.jenkinsLoadBalancer = new elbv2.NetworkLoadBalancer(this, 'JenkinsNLB', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: `${props.projectName}-${props.environment}-jenkins-nlb`,
      vpcSubnets: {
        subnets: [props.subnet],
      },
    });

    // Create Target Group for Jenkins
    const jenkinsTargetGroup = new elbv2.NetworkTargetGroup(this, 'JenkinsTargetGroup', {
      vpc: props.vpc,
      port: 8080,
      protocol: elbv2.Protocol.TCP,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        enabled: true,
        port: '8080',
        protocol: elbv2.Protocol.TCP,
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
      },
      targetGroupName: `${props.projectName}-${props.environment}-jenkins-tg`,
    });

    // Add target group to Auto Scaling Group
    this.jenkinsAutoScalingGroup.attachToNetworkTargetGroup(jenkinsTargetGroup);

    // Create NLB Listener
    this.jenkinsLoadBalancer.addListener('JenkinsListener', {
      port: 80,
      protocol: elbv2.Protocol.TCP,
      defaultAction: elbv2.NetworkListenerAction.forward([jenkinsTargetGroup]),
    });

    // Store Jenkins URL in SSM Parameter Store
    new ssm.StringParameter(this, 'JenkinsUrlParameter', {
      parameterName: `/${props.projectName}/${props.environment}/jenkins-url`,
      description: 'Jenkins URL',
      stringValue: `http://${this.jenkinsLoadBalancer.loadBalancerDnsName}`,
    });

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}