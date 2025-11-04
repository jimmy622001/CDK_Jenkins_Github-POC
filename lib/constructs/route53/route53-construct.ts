import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface Route53ConstructProps {
  domainName: string;
  environment: string;
  projectName: string;
  loadBalancerDnsName: string;
  loadBalancerCanonicalHostedZoneId: string;
}

export class Route53Construct extends Construct {
  public readonly hostedZone: route53.IHostedZone;
  public readonly domainRecord: route53.ARecord;

  constructor(scope: Construct, id: string, props: Route53ConstructProps) {
    super(scope, id);

    // Create a new Hosted Zone
    this.hostedZone = new route53.PublicHostedZone(this, 'HostedZone', {
      zoneName: props.domainName,
    });

    // Create subdomain for environment
    const subDomainName = props.environment === 'prod' 
      ? props.domainName 
      : `${props.environment}.${props.domainName}`;

    // Create a record pointing to the load balancer
    this.domainRecord = new route53.ARecord(this, 'DomainRecord', {
      zone: this.hostedZone,
      recordName: subDomainName,
      target: route53.RecordTarget.fromAlias(
        new targets.LoadBalancerTarget({
          loadBalancerDnsName: props.loadBalancerDnsName,
          loadBalancerCanonicalHostedZoneId: props.loadBalancerCanonicalHostedZoneId,
        } as any)
      ),
    });

    // Add tags to all resources
    cdk.Tags.of(this).add('Environment', props.environment);
    cdk.Tags.of(this).add('Project', props.projectName);
  }
}