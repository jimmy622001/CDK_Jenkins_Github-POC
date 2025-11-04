import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as config from 'aws-cdk-lib/aws-config';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as securityhub from 'aws-cdk-lib/aws-securityhub';
import { Construct } from 'constructs';

export interface SecurityConstructProps {
  vpc: ec2.IVpc;
  environment: string;
  projectName: string;
  blockedIpAddresses: string[];
  maxRequestSize: number;
  requestLimit: number;
  enableSecurityHub: boolean;
  awsRegion: string;
}

export class SecurityConstruct extends Construct {
  public readonly wafWebAcl: wafv2.CfnWebACL;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly jenkinsSecurityGroup: ec2.SecurityGroup;
  
  constructor(scope: Construct, id: string, props: SecurityConstructProps) {
    super(scope, id);

    // Generate a random string for bucket names
    const suffixId = `${props.environment}-${Math.floor(Math.random() * 100000000).toString(36)}`;

    // Create Security Groups
    this.albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for application load balancer',
      allowAllOutbound: false,
    });

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS from internet'
    );

    this.albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP from internet (for redirection to HTTPS)'
    );

    this.albSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(80),
      'HTTP to ECS services'
    );

    this.albSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS to internet for external resources'
    );

    this.ecsSecurityGroup = new ec2.SecurityGroup(this, 'EcsSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for ECS Fargate tasks',
      allowAllOutbound: false,
    });

    this.ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(80),
      'HTTP from VPC'
    );

    this.ecsSecurityGroup.addIngressRule(
      this.ecsSecurityGroup,
      ec2.Port.tcp(8080),
      'Inter-container communication'
    );

    this.ecsSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS to internet for external resources'
    );

    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for database instances',
      allowAllOutbound: false,
    });

    this.dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'Database port from VPC'
    );

    this.dbSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcpRange(1024, 65535),
      'Response traffic to VPC'
    );

    this.ecsSecurityGroup.addEgressRule(
      this.dbSecurityGroup,
      ec2.Port.tcp(5432),
      'Database access'
    );

    this.jenkinsSecurityGroup = new ec2.SecurityGroup(this, 'JenkinsSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Jenkins server',
      allowAllOutbound: true,
    });

    this.jenkinsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'SSH access'
    );

    this.jenkinsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Jenkins web interface'
    );

    // Create WAF IP Set for known bad IPs
    const ipSet = new wafv2.CfnIPSet(this, 'KnownBadIps', {
      addresses: props.blockedIpAddresses,
      ipAddressVersion: 'IPV4',
      scope: 'REGIONAL',
      description: 'Known malicious IP addresses',
      name: `${props.projectName}-${props.environment}-bad-ips`,
    });

    // Create AWS WAF Web ACL with OWASP Top 10 Protections
    this.wafWebAcl = new wafv2.CfnWebACL(this, 'OwaspTop10Protection', {
      name: `${props.projectName}-${props.environment}-owasp-protection`,
      description: 'WAF WebACL with OWASP Top 10 protections',
      scope: 'REGIONAL',
      defaultAction: {
        allow: {},
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'owasp-top10-protection',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'block-known-bad-ips',
          priority: 0,
          action: {
            block: {},
          },
          statement: {
            ipSetReferenceStatement: {
              arn: ipSet.attrArn,
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'BlockKnownBadIPs',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesSQLiRuleSet',
          priority: 10,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesSQLiRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesSQLiRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesXSSRuleSet',
          priority: 20,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesXSSRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesXSSRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'SizeConstraint',
          priority: 30,
          action: {
            block: {},
          },
          statement: {
            sizeConstraintStatement: {
              fieldToMatch: {
                body: {},
              },
              comparisonOperator: 'GT',
              size: props.maxRequestSize,
              textTransformations: [
                {
                  priority: 0,
                  type: 'NONE',
                },
              ],
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'SizeConstraint',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'RateBasedRule',
          priority: 40,
          action: {
            block: {},
          },
          statement: {
            rateBasedStatement: {
              limit: props.requestLimit,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateBasedRule',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesKnownBadInputsRuleSet',
          priority: 50,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 60,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesCommonRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCommonRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesPHPRuleSet',
          priority: 70,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesPHPRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesPHPRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesLinuxRuleSet',
          priority: 80,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesLinuxRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesLinuxRuleSet',
            sampledRequestsEnabled: true,
          },
        },
        {
          name: 'AWS-AWSManagedRulesBotControlRuleSet',
          priority: 90,
          overrideAction: {
            none: {},
          },
          statement: {
            managedRuleGroupStatement: {
              name: 'AWSManagedRulesBotControlRuleSet',
              vendorName: 'AWS',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesBotControlRuleSet',
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    // Create WAF Logging Configuration
    const wafLogsBucket = new s3.Bucket(this, 'WafLogsBucket', {
      bucketName: `${props.projectName}-${props.environment}-waf-logs-${suffixId}`,
      removalPolicy: props.environment !== 'prod' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    // Create SNS Topic for Security Alerts
    const securityAlertsTopic = new sns.Topic(this, 'SecurityAlertsTopic', {
      topicName: `${props.projectName}-${props.environment}-security-alerts`,
    });

    // Config S3 bucket
    const configBucket = new s3.Bucket(this, 'ConfigBucket', {
      bucketName: `${props.projectName}-${props.environment}-config-${suffixId}`,
      removalPolicy: props.environment !== 'prod' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    // IAM Role for AWS Config
    const configRole = new iam.Role(this, 'ConfigRole', {
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      roleName: `${props.projectName}-${props.environment}-config-role`,
    });

    configRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:PutObject',
          's3:GetBucketAcl',
        ],
        resources: [
          configBucket.bucketArn,
          `${configBucket.bucketArn}/*`,
        ],
      })
    );

    configRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sns:Publish'],
        resources: [securityAlertsTopic.topicArn],
      })
    );

    configRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'config:Put*',
          'config:Get*',
          'config:List*',
          'config:Describe*',
        ],
        resources: ['*'],
      })
    );

    // AWS Config Recorder
    const configRecorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
      name: `${props.projectName}-${props.environment}-config-recorder`,
      roleArn: configRole.roleArn,
      recordingGroup: {
        allSupported: true,
        resourceTypes: [
          'AWS::EC2::Instance',
          'AWS::EC2::SecurityGroup',
          'AWS::ECS::Cluster',
          'AWS::ElasticLoadBalancingV2::LoadBalancer',
          'AWS::S3::Bucket',
          'AWS::RDS::DBInstance',
          'AWS::IAM::Role',
          'AWS::IAM::Policy',
        ],
      },
    });

    // AWS Config Delivery Channel
    const configDeliveryChannel = new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
      name: `${props.projectName}-${props.environment}-config-channel`,
      s3BucketName: configBucket.bucketName,
      s3KeyPrefix: 'config',
      snsTopicArn: securityAlertsTopic.topicArn,
    });

    configDeliveryChannel.addDependsOn(configRecorder);

    // AWS Config Recorder Status would be created here
    // In a real implementation, we would create this resource
    // For this example, we'll skip it as it requires additional setup

    // AWS Config Rules
    const configRuleRestrictedSsh = new config.CfnConfigRule(this, 'RestrictedSshRule', {
      configRuleName: `${props.projectName}-${props.environment}-restricted-ssh`,
      source: {
        owner: 'AWS',
        sourceIdentifier: 'INCOMING_SSH_DISABLED',
      },
    });

    configRuleRestrictedSsh.addDependsOn(configRecorder);

    const configRuleEncryptedVolumes = new config.CfnConfigRule(this, 'EncryptedVolumesRule', {
      configRuleName: `${props.projectName}-${props.environment}-encrypted-volumes`,
      source: {
        owner: 'AWS',
        sourceIdentifier: 'ENCRYPTED_VOLUMES',
      },
    });

    configRuleEncryptedVolumes.addDependsOn(configRecorder);

    const configRuleRootMfa = new config.CfnConfigRule(this, 'RootMfaRule', {
      configRuleName: `${props.projectName}-${props.environment}-root-mfa`,
      source: {
        owner: 'AWS',
        sourceIdentifier: 'ROOT_ACCOUNT_MFA_ENABLED',
      },
    });

    configRuleRootMfa.addDependsOn(configRecorder);

    const configRuleIamPasswordPolicy = new config.CfnConfigRule(this, 'IamPasswordPolicyRule', {
      configRuleName: `${props.projectName}-${props.environment}-iam-password-policy`,
      source: {
        owner: 'AWS',
        sourceIdentifier: 'IAM_PASSWORD_POLICY',
      },
    });

    configRuleIamPasswordPolicy.addDependsOn(configRecorder);

    const configRuleS3PublicReadProhibited = new config.CfnConfigRule(this, 'S3PublicReadProhibitedRule', {
      configRuleName: `${props.projectName}-${props.environment}-s3-public-read-prohibited`,
      source: {
        owner: 'AWS',
        sourceIdentifier: 'S3_BUCKET_PUBLIC_READ_PROHIBITED',
      },
    });

    configRuleS3PublicReadProhibited.addDependsOn(configRecorder);

    const configRuleS3PublicWriteProhibited = new config.CfnConfigRule(this, 'S3PublicWriteProhibitedRule', {
      configRuleName: `${props.projectName}-${props.environment}-s3-public-write-prohibited`,
      source: {
        owner: 'AWS',
        sourceIdentifier: 'S3_BUCKET_PUBLIC_WRITE_PROHIBITED',
      },
    });

    configRuleS3PublicWriteProhibited.addDependsOn(configRecorder);

    const configRuleS3SslRequestsOnly = new config.CfnConfigRule(this, 'S3SslRequestsOnlyRule', {
      configRuleName: `${props.projectName}-${props.environment}-s3-ssl-requests-only`,
      source: {
        owner: 'AWS',
        sourceIdentifier: 'S3_BUCKET_SSL_REQUESTS_ONLY',
      },
    });

    configRuleS3SslRequestsOnly.addDependsOn(configRecorder);

    // GuardDuty
    const guardDutyDetector = new guardduty.CfnDetector(this, 'GuardDutyDetector', {
      enable: true,
      findingPublishingFrequency: 'SIX_HOURS',
    });

    // CloudWatch Event Rule for GuardDuty
    const guardDutyEventRule = new events.Rule(this, 'GuardDutyEventRule', {
      ruleName: `${props.projectName}-${props.environment}-guardduty-event`,
      description: 'Capture GuardDuty findings',
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding'],
      },
    });

    guardDutyEventRule.addTarget(
      new targets.SnsTopic(securityAlertsTopic)
    );

    // Security Hub (Optional)
    if (props.enableSecurityHub) {
      new securityhub.CfnHub(this, 'SecurityHub');
    }

    // CloudWatch Dashboard for security monitoring
    const securityDashboard = new cloudwatch.Dashboard(this, 'SecurityDashboard', {
      dashboardName: `${props.projectName}-${props.environment}-security-dashboard`,
    });

    securityDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'WAF Blocked Requests',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAF',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: this.wafWebAcl.ref,
              Region: props.awsRegion,
            },
            period: cdk.Duration.seconds(300),
          }),
        ],
      }),

      new cloudwatch.GraphWidget({
        title: 'WAF Allowed Requests',
        width: 12,
        height: 6,
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAF',
            metricName: 'AllowedRequests',
            dimensionsMap: {
              WebACL: this.wafWebAcl.ref,
              Region: props.awsRegion,
            },
            period: cdk.Duration.seconds(300),
          }),
        ],
      })
    );

    new cloudwatch.GraphWidget({
      title: 'WAF Rules Activity',
      width: 24,
      height: 6,
      left: [
        new cloudwatch.Metric({
          namespace: 'AWS/WAF',
          metricName: 'CountedRequests',
          dimensionsMap: {
            Rule: 'RateBasedRule',
            WebACL: this.wafWebAcl.ref,
            Region: props.awsRegion,
          },
          period: cdk.Duration.seconds(300),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/WAF',
          metricName: 'CountedRequests',
          dimensionsMap: {
            Rule: 'AWS-AWSManagedRulesSQLiRuleSet',
            WebACL: this.wafWebAcl.ref,
            Region: props.awsRegion,
          },
          period: cdk.Duration.seconds(300),
        }),
        new cloudwatch.Metric({
          namespace: 'AWS/WAF',
          metricName: 'CountedRequests',
          dimensionsMap: {
            Rule: 'AWS-AWSManagedRulesXSSRuleSet',
            WebACL: this.wafWebAcl.ref,
            Region: props.awsRegion,
          },
          period: cdk.Duration.seconds(300),
        }),
      ],
    });

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}