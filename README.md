# ECS Jenkins GitHub CDK Project POC

This project implements an AWS infrastructure for running Jenkins in ECS with GitHub integration, using AWS CDK.

## 🏗️ Architecture

The project creates a fully automated infrastructure with:

- ECS cluster for containerized applications
- Jenkins CI/CD server on EC2
- RDS database
- AWS CloudWatch monitoring
- WAF security protection
- Load balancers for traffic distribution

## 🔧 Multi-Environment Setup

The project supports three environments:

1. **Development (dev)**: A smaller version of the infrastructure for development and testing purposes.
   - Located in `us-east-1` region
   - Smaller instance types
   - Fewer ECS tasks/containers
   - Non-production database

2. **Production (prod)**: The main production environment with full capacity.
   - Located in `us-east-1` region
   - Production-grade instance types
   - Multiple ECS tasks/containers for high availability
   - Multi-AZ database

3. **Disaster Recovery (dr)**: A pilot light DR environment in a different AWS region.
   - Located in `us-west-2` region (West Coast)
   - Minimal resources during normal operation
   - Can scale up quickly during disaster recovery
   - Kept in sync with production

## 🔄 CI/CD Pipeline

The project includes a GitHub Actions CI/CD pipeline that automates deployments to all three environments:

- Push to `main` branch deploys to dev environment
- Push to `production` branch deploys to prod environment
- Push to `dr` branch deploys to dr environment

Additionally:
- After a production deployment, the DR environment is automatically synchronized
- The DR environment can be manually activated in case of a disaster

## 📋 Prerequisites

- Node.js 16+
- AWS CLI configured with appropriate permissions
- GitHub account for CI/CD integration

## 🚀 Getting Started

1. Clone this repository.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file by copying `.env.example` and filling in the required values.

4. Deploy the stacks:
   ```bash
   # Deploy development environment
   npx cdk deploy EcsJenkinsGithubDevStack
   
   # Deploy production environment
   npx cdk deploy EcsJenkinsGithubProdStack
   
   # Deploy DR environment 
   npx cdk deploy EcsJenkinsGithubDrStack
   ```

## 🔄 Environment-Specific Values

Each environment has its own configuration values:

### Development Environment (dev)
- Smaller EC2 instances (`t3.small`)
- Minimal scaling (1-3 instances)
- Uses spot instances to reduce costs
- Doesn't enable AWS Security Hub

### Production Environment (prod)
- Larger EC2 instances (`m5.large`)
- Higher scaling capacity (2-10 instances)
- Uses on-demand instances for reliability
- Enables AWS Security Hub
- Multi-AZ database deployment

### DR Environment (dr)
- Minimal resources during normal operation (`t3.micro`)
- Can scale up to match production capacity when needed
- Located in a different AWS region (`us-west-2`)
- Kept in sync with production data

## 🔐 Security

The project follows security best practices:
- TLS for all public endpoints
- Security groups with least privilege
- IAM roles with minimum permissions
- Web Application Firewall (WAF) protection
- Content Security Policy headers

## 🛠️ Utilities

The project includes several utility scripts:

- `scripts/sync-dr.sh`: Synchronizes data from production to DR
- `scripts/activate-dr.sh`: Activates the DR environment in case of disaster

## 📖 Documentation

Additional documentation is available in the `docs` directory:
- [DR Runbook](docs/DR-RUNBOOK.md): Detailed procedures for disaster recovery

## 🙋 Support

For any issues or questions, please contact the project maintainers.
