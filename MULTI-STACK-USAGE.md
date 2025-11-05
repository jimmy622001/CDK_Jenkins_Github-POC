# Multi-Stack Architecture for ECS Jenkins CDK Project

This document describes the multi-stack architecture that separates infrastructure, cluster, and application deployment, supporting the following requirements:

1. Three separate environments: `prod`, `dev`, and `dr`
2. Each environment runs in a separate stack
3. Each environment has its own domain configuration and scaling settings
4. Each environment has a dedicated GitHub branch for CI/CD
5. Infrastructure and cluster components are deployed separately from application components

## Architecture Overview

The project is divided into separate stacks for infrastructure, cluster, and application resources:

### Infrastructure Stack
Contains long-lived resources that rarely change:
- VPC and network resources (subnets, route tables, NAT gateways)
- Security groups and Network ACLs
- IAM roles and policies
- RDS database infrastructure
- S3 buckets for storage
- Route53 DNS configuration (base setup)
- CloudFront distributions

### Cluster Stack
Manages the container orchestration platform:
- ECS/EKS cluster configuration
- Capacity providers
- Auto-scaling groups for cluster nodes
- Base cluster monitoring
- Cluster-level IAM roles
- Shared services (service discovery, log groups)

### Application Stack
Contains application-specific resources that change frequently:
- ECS services and task definitions
- Application-specific auto-scaling rules
- Jenkins CI/CD resources
- Load balancers and target groups
- Application monitoring resources
- Route53 DNS records (pointing to load balancer)

## Environments

### Production (prod)
- Domain: `example.com`
- Branch: `production`
- Region: `us-east-1`
- Full-sized resources optimized for performance and reliability
- High availability configuration with multiple AZs
- Enhanced security controls

### Development (dev)
- Domain: `dev.example.com`
- Branch: `main`
- Region: `us-east-1`
- Scaled down for cost savings during development
- Reduced redundancy
- Simplified scaling policies

### Disaster Recovery (dr)
- Domain: `dr-ecs-jenkins.example.com`
- Branch: `dr`
- Region: `us-west-2`
- Pilot light configuration for failover
- Minimal resources until activated
- Regular data synchronization from production

## Deployment Actions and Timing

### When to Deploy Each Component

#### Infrastructure Deployment
Infrastructure components should be deployed:
- During initial environment setup
- When making fundamental architecture changes
- When modifying networking, security, or IAM configurations
- Typically once every few months or less frequently

#### Cluster Deployment
Cluster components should be deployed:
- When upgrading ECS/EKS versions
- When changing cluster capacity management strategies
- When updating node configurations or instance types
- Typically once every few weeks or months

#### Application Deployment
Application components should be deployed:
- For each new application version release
- When updating task definitions or service configurations
- When modifying scaling policies specific to services
- Can occur multiple times per day

### Deployment Commands

#### Infrastructure Deployment
```bash
# Deploy infrastructure for specific environment
npm run deploy:infra -- --env=dev
npm run deploy:infra -- --env=prod
npm run deploy:infra -- --env=dr

# Check infrastructure changes without deploying
npm run deploy:infra -- --env=prod --diff
```

#### Cluster Deployment
```bash
# Deploy cluster for specific environment
npm run deploy:cluster -- --env=dev
npm run deploy:cluster -- --env=prod
npm run deploy:cluster -- --env=dr

# Check cluster changes without deploying
npm run deploy:cluster -- --env=prod --diff
```

#### Application Deployment
```bash
# Deploy application for specific environment
npm run deploy:app -- --env=dev
npm run deploy:app -- --env=prod
npm run deploy:app -- --env=dr

# Deploy with specific parameters
npm run deploy:app -- --env=prod --version=1.2.3
```

#### Combined Deployment
For initial setup or comprehensive updates:
```bash
# Deploy all components for an environment
npm run deploy:all -- --env=dev
```

## CI/CD Pipeline Configuration

The project uses separate CI/CD pipelines for infrastructure, cluster, and application components:

### Pipeline Separation

1. **Infrastructure Pipeline** (.github/workflows/deploy-infrastructure.yml)
   - Handles infrastructure-only deployments
   - Triggered manually with environment parameter
   - Requires approvals for production changes
   - Performs drift detection before deployment
   - Example trigger:
     ```bash
     # Via GitHub web interface
     Actions → deploy-infrastructure → Run workflow → Select environment

     # Via GitHub CLI
     gh workflow run deploy-infrastructure.yml -f environment=prod
     ```

2. **Cluster Pipeline** (.github/workflows/deploy-cluster.yml)
   - Manages cluster-specific deployments
   - Triggered manually when cluster updates are needed
   - Coordinates with application team for version compatibility
   - Example trigger:
     ```bash
     # Via GitHub CLI
     gh workflow run deploy-cluster.yml -f environment=prod
     ```

3. **Application Pipeline** (.github/workflows/deploy-application.yml)
   - Handles frequent application updates
   - Triggered automatically on code changes
   - Branch-to-environment mapping:
     - `main` → dev environment
     - `production` → prod environment
     - `dr` → dr environment
   - Supports manual triggering with parameters

### Automated Pipeline Execution

1. **Branch-Based Automation**:
   - Commits to designated branches trigger appropriate pipelines
   - Each branch maps to a specific environment

2. **Manual Pipeline Execution**:
   - Use GitHub Actions UI for manual triggers with options for:
     - Environment: `dev`, `prod`, or `dr`
     - Deploy target: `infra`, `cluster`, `app`, or `all`
     - Additional parameters: version, features, etc.

## Branch Synchronization and Code Management

The project uses a branch-per-environment strategy to ensure controlled deployments.

### Branch Management

To synchronize changes between branches, use the sync-branches.sh script:

```bash
# Push changes to production branch
./scripts/sync-branches.sh -m "Update infrastructure" production

# Push changes to DR branch
./scripts/sync-branches.sh -m "Update DR configuration" dr
```

### Code Organization for Multi-Stack Architecture

1. **Stack Definitions**:
   - `lib/infrastructure-stack.ts`: Infrastructure components
   - `lib/cluster-stack.ts`: Cluster configuration
   - `lib/application-stack.ts`: Application services

2. **Entry Points**:
   - `bin/cdk-projects.ts`: Main CDK app that instantiates all stacks
   - Additional entry points for specific stack types are available

3. **Configuration Management**:
   - Environment configurations are centralized in `lib/constructs/config/environment-config.ts`
   - Each stack imports only the configuration it needs

## Disaster Recovery

The DR environment is maintained as a pilot light in the us-west-2 region (separate from the primary us-east-1 region).

### DR Maintenance Procedures

1. **Regular Data Synchronization**
   - **Automatic synchronization**: After each production deployment, data is synced to DR
   - **Scheduled synchronization**: Daily backups are replicated to DR region
   - **Manual synchronization**: Run `./scripts/sync-dr.sh` when needed

2. **DR Testing**
   - **Monthly simulations**: Perform DR activation test in isolated environment
   - **Validation**: Verify DNS failover, database restore, and application startup
   - **Test script**: `./scripts/test-dr-readiness.sh`

3. **DR Activation Process**
   In case of disaster, follow this process:

   ```bash
   # Step 1: Activate DR environment (scales up resources)
   ./scripts/activate-dr.sh

   # Step 2: Verify application health
   ./scripts/verify-dr-health.sh

   # Step 3: Update DNS records for failover
   ./scripts/update-dr-dns.sh
   ```

Refer to `docs/DR-RUNBOOK.md` for comprehensive DR procedures and recovery time objectives.

## Best Practices and Guidelines

### Infrastructure Changes
- **Plan thoroughly**: Infrastructure changes may affect all components
- **Test in dev first**: Always validate changes in development environment
- **Use change sets**: Review CloudFormation change sets before applying
- **Maintenance windows**: Schedule infrastructure changes during off-peak hours
- **Document changes**: Update architecture diagrams and documentation

### Cluster Changes
- **Version compatibility**: Ensure application compatibility with cluster versions
- **Capacity planning**: Adjust cluster capacity based on application requirements
- **Blue/green upgrades**: Consider blue/green approach for major version upgrades
- **Monitor rollout**: Watch cluster metrics during and after changes

### Application Changes
- **Deploy independently**: Update application without touching infrastructure
- **Automated testing**: Run full test suite before deployment
- **Canary releases**: Consider canary deployments for critical changes
- **Rollback plan**: Have a clear rollback strategy for each deployment

### Multi-Stack Management
- **Stack dependencies**: Be aware of dependencies between stacks
- **Output sharing**: Use CloudFormation exports to share values between stacks
- **Conditional resources**: Use conditions to customize resources per environment
- **Keep stacks focused**: Each stack should have a single responsibility

### Configuration Management
- **Environment variables**: Store environment-specific settings in `environment-config.ts`
- **Secret management**: Use AWS Secrets Manager for sensitive values
- **Parameter validation**: Validate configuration parameters during deployment
- **Defaults**: Provide sensible defaults for optional parameters

## Continuous Improvement

Regularly evaluate and enhance the deployment process:

1. **Deployment metrics**:
   - Track deployment frequency, lead time, failure rate
   - Optimize pipelines based on metrics

2. **Cost optimization**:
   - Tag resources appropriately for cost allocation
   - Review resource utilization and adjust scaling

3. **Security posture**:
   - Regular security audits of infrastructure code
   - Update dependencies and patch vulnerable components