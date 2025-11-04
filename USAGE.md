# CDK Usage Guide for Terraform Users

This guide is specifically designed for developers familiar with Terraform who are looking to understand and work with this AWS CDK project.

## Terraform to CDK Conceptual Mapping

| Terraform Concept | CDK Equivalent | Description |
|-------------------|----------------|-------------|
| `.tf` files | TypeScript classes | Instead of declarative HCL files, CDK uses object-oriented code |
| `terraform.tfvars` | Context values in `cdk.json` or environment variables | For configurable parameters |
| `terraform init` | `npm install` + `cdk bootstrap` | Prepares your environment and AWS account |
| `terraform plan` | `cdk diff` | Shows what changes would be made |
| `terraform apply` | `cdk deploy` | Applies the changes to your AWS account |
| `terraform destroy` | `cdk destroy` | Removes all resources |
| Modules | Constructs | Reusable components (CDK has L1, L2, and L3 abstractions) |
| Provider config | AWS SDK/CDK config | Configure via environment variables or `~/.aws/` |
| Remote state | CloudFormation | CDK uses CloudFormation for state management |
| `tflint` | ESLint | Code linting with TypeScript integration |
| `checkov` | `cdk-nag` | Security and best practice scanning |

## Getting Started (Step by Step for Terraform Users)

### 1. Environment Setup

```bash
# Install Prerequisites (Node.js and npm)
# For Windows:
# Download and install Node.js from https://nodejs.org/

# Install AWS CDK Toolkit
npm install -g aws-cdk

# Clone this repository and navigate into it
git clone <repository-url>
cd <repository-name>

# Install dependencies
npm install
```

### 2. Understanding the Project Structure

In Terraform, you might have separate `.tf` files for different resource types. In CDK:

- **`bin/cdk-projects.ts`**: The entry point (similar to a root `main.tf`)
- **`lib/ecs-jenkins-github-stack.ts`**: The main stack definition
- **`lib/constructs/`**: Organized constructs (similar to Terraform modules)

### 3. Configuration

Unlike Terraform's `.tfvars` files, CDK uses:

1. **Context values** in `cdk.json`
2. **Environment variables** for sensitive information
3. **Parameters** passed to construct constructors

```bash
# Set environment variables for sensitive information
# (similar to using a .tfvars file in Terraform)
export DB_USERNAME=your_db_username
export DB_PASSWORD=your_db_password
export GRAFANA_ADMIN_PASSWORD=your_grafana_password
```

### 4. Preview Changes

```bash
# Equivalent to 'terraform plan'
cdk diff
```

### 5. Deploy the Stack

```bash
# Equivalent to 'terraform apply'
cdk deploy
```

If you need to deploy a specific stack:

```bash
cdk deploy EcsJenkinsGithubDevStack
```

### 6. Destroy Resources

```bash
# Equivalent to 'terraform destroy'
cdk destroy
```

## Key Differences from Terraform

1. **Code vs. Configuration**:
   - Terraform: Declarative HCL configuration
   - CDK: Imperative TypeScript/JavaScript code

2. **Abstraction Levels**:
   - Terraform: Typically close to the API (with some abstraction in modules)
   - CDK: L1 (CloudFormation), L2 (AWS managed), L3 (patterns) constructs with increasing abstraction

3. **Dependencies**:
   - Terraform: Explicit dependency management with `depends_on`
   - CDK: Implicit dependency resolution through object references

4. **State Management**:
   - Terraform: Explicit state files (local or remote)
   - CDK: Handled by AWS CloudFormation

5. **Security Scanning**:
   - Terraform: tflint, checkov, tfsec
   - CDK: cdk-nag, ESLint, npm audit

## Common Tasks for Terraform Users

### Adding a New Resource

**Terraform:**
```hcl
resource "aws_s3_bucket" "example" {
  bucket = "my-example-bucket"
  acl    = "private"
}
```

**CDK:**
```typescript
import * as s3 from 'aws-cdk-lib/aws-s3';

const bucket = new s3.Bucket(this, 'ExampleBucket', {
  bucketName: 'my-example-bucket',
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.DESTROY, // Equivalent to Terraform's `force_destroy = true`
});
```

### Creating a Module/Construct

**Terraform Module:**
```hcl
# modules/storage/main.tf
resource "aws_s3_bucket" "bucket" {
  bucket = var.bucket_name
  # other properties...
}

# Usage:
module "storage" {
  source = "./modules/storage"
  bucket_name = "my-bucket"
}
```

**CDK Construct:**
```typescript
// lib/constructs/storage/storage-construct.ts
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageConstructProps {
  bucketName: string;
}

export class StorageConstruct extends Construct {
  public readonly bucket: s3.Bucket;
  
  constructor(scope: Construct, id: string, props: StorageConstructProps) {
    super(scope, id);
    
    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: props.bucketName,
      // other properties...
    });
  }
}

// Usage:
const storage = new StorageConstruct(this, 'Storage', {
  bucketName: 'my-bucket'
});
```

## Security and Compliance

This CDK project uses `cdk-nag` for security scanning, which is similar to `checkov` in the Terraform ecosystem:

```bash
# Check for security and compliance issues
npm run build   # First build your code
cdk synth       # This will show cdk-nag warnings/errors in the output
```

## Infrastructure as Code Testing

Similar to Terraform, CDK supports unit and integration testing:

```bash
# Run tests
npm test
```

## Debugging Tips for Terraform Users

1. **CloudFormation Stack Events**: When deployments fail, check the CloudFormation console for stack events (unlike Terraform which shows errors in CLI output).

2. **CDK Metadata**: CDK adds metadata to resources to track them. This is similar to how Terraform tags resources with `terraform_managed`.

3. **Role Assumption**: If you're used to Terraform's provider configurations for role assumption, in CDK you would:

```typescript
// Configure AWS SDK to use a specific role
const app = new cdk.App({
  context: {
    '@aws-cdk/core:roleAssumptionViaPath': 'true',
  },
});
```

## What This Project Builds

This CDK project builds a complete CI/CD infrastructure with:

1. **Jenkins Server**: Running on ECS for scalability
2. **GitHub Integration**: For source code management
3. **Complete Network**: VPC, subnets, security groups
4. **Database**: RDS PostgreSQL instance for application data
5. **Security**: WAF with OWASP Top 10 protections
6. **Monitoring**: Prometheus and Grafana
7. **DNS**: Route53 configuration

The deployment flow is:
1. Network infrastructure is created
2. Security groups and IAM roles are established
3. Database is deployed
4. ECS cluster and Jenkins service are launched
5. Monitoring infrastructure is set up
6. DNS records are created

This provides a production-ready Jenkins CI/CD environment with security and monitoring best practices.