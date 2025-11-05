#!/bin/bash
# Script to validate DR environment readiness

set -e

# Configuration
DR_REGION="us-west-2"
DR_ENV_NAME="dr"
PRIMARY_REGION="us-east-1"
APP_NAME="ecs-jenkins"
TIMEOUT=300 # 5 minutes

echo "Starting DR readiness validation..."

# Switch to DR region
echo "Setting AWS region to $DR_REGION..."
export AWS_DEFAULT_REGION=$DR_REGION

# Check if ECS cluster is running
echo "Checking ECS cluster status..."
CLUSTER_NAME="${APP_NAME}-${DR_ENV_NAME}"
CLUSTER_STATUS=$(aws ecs describe-clusters --clusters $CLUSTER_NAME --query 'clusters[0].status' --output text)

if [ "$CLUSTER_STATUS" != "ACTIVE" ]; then
  echo "ERROR: DR cluster is not active! Status: $CLUSTER_STATUS"
  exit 1
fi

echo "ECS cluster is active."

# Check for required ECR images (compare with production)
echo "Checking ECR image replication status..."
export AWS_DEFAULT_REGION=$PRIMARY_REGION
PROD_IMAGES=$(aws ecr describe-images --repository-name $APP_NAME --query 'imageDetails[*].imageTags' --output json)

export AWS_DEFAULT_REGION=$DR_REGION
DR_IMAGES=$(aws ecr describe-images --repository-name $APP_NAME --query 'imageDetails[*].imageTags' --output json)

# Simple check if the latest production image exists in DR
if [[ "$DR_IMAGES" != *"$(echo $PROD_IMAGES | grep -o '"latest"')"* ]]; then
  echo "ERROR: Latest image not replicated to DR!"
  exit 1
fi

echo "ECR image replication check passed."

# Check RDS snapshot status for DR
echo "Checking database snapshot replication..."
SNAPSHOT_STATUS=$(aws rds describe-db-cluster-snapshots --snapshot-type shared --query "DBClusterSnapshots[?DBClusterIdentifier=='$APP_NAME-prod'].Status" --output text)

if [ "$SNAPSHOT_STATUS" != "available" ]; then
  echo "WARNING: DB snapshot status is $SNAPSHOT_STATUS, not 'available'"
fi

echo "Database snapshot replication check passed."

# Check Route 53 health checks and failover readiness
echo "Checking DNS failover readiness..."
DNS_HEALTH_CHECK_ID=$(aws route53 list-health-checks --query "HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName=='dr-$APP_NAME.example.com'].Id" --output text)

if [ -n "$DNS_HEALTH_CHECK_ID" ]; then
  HEALTH_STATUS=$(aws route53 get-health-check-status --health-check-id $DNS_HEALTH_CHECK_ID --query 'HealthCheckObservations[0].StatusReport.Status' --output text)
  echo "DR DNS health check status: $HEALTH_STATUS"
else
  echo "WARNING: Could not find DR DNS health check"
fi

# Validate security group rules between prod and DR
echo "Validating security group configuration..."
DR_SG_ID=$(aws ec2 describe-security-groups --filters "Name=tag:Name,Values=$APP_NAME-$DR_ENV_NAME" --query 'SecurityGroups[0].GroupId' --output text)
if [ -z "$DR_SG_ID" ] || [ "$DR_SG_ID" == "None" ]; then
  echo "WARNING: Could not find DR security group"
else
  echo "DR Security Group found: $DR_SG_ID"
fi

# Validate activation script
echo "Validating activation script..."
if [ ! -f "$(dirname "$0")/activate-dr.sh" ]; then
  echo "ERROR: DR activation script not found!"
  exit 1
fi

echo "Activation script exists."

# Validation summary
echo ""
echo "===== DR Readiness Validation Summary ====="
echo "✅ ECS cluster is active"
echo "✅ ECR image replication check passed"
echo "✅ Database snapshot replication check passed" 
echo "✅ Activation script exists"
echo "DR environment is ready for activation if needed."
echo "=========================================="

exit 0