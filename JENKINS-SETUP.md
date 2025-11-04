# Jenkins CI/CD Setup Guide

This document provides detailed instructions for setting up and configuring the Jenkins CI/CD pipeline that comes with this CDK project.

## Initial Jenkins Setup

After deploying the CDK stack, you'll need to:

1. **Access the Jenkins UI**:
   - Navigate to the Jenkins URL (available in the CDK output or through the Route53 domain configured)
   - The initial admin password can be found in the ECS task logs:
     ```bash
     aws logs get-log-events --log-group-name /ecs/jenkins --log-stream-name <log-stream-name> | grep "initialAdminPassword"
     ```

2. **Configure Jenkins**:
   - Install recommended plugins when prompted
   - Create an admin user
   - Configure Jenkins URL

## Connecting Jenkins to GitHub

1. **Create a GitHub Personal Access Token**:
   - Go to GitHub → Settings → Developer settings → Personal access tokens
   - Generate a new token with repo, admin:repo_hook, and workflow permissions
   - Copy the token (you won't see it again)

2. **Configure GitHub in Jenkins**:
   - Navigate to Manage Jenkins → Configure System
   - Find the GitHub section
   - Add GitHub Server
   - Add credentials (use the Personal Access Token)
   - Test the connection

3. **Create a Jenkins Pipeline Job**:
   - New Item → Pipeline
   - Configure Pipeline:
     - Definition: Pipeline script from SCM
     - SCM: Git
     - Repository URL: Your GitHub repository URL
     - Credentials: GitHub credentials
     - Branch Specifier: `*/main` (or your default branch)
     - Script Path: `Jenkinsfile`
   - Save

## Jenkinsfile Explained

The provided Jenkinsfile defines a CI/CD pipeline for CDK projects:

```groovy
pipeline {
    agent any
    
    environment {
        NODE_ENV = 'production'
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }
        
        stage('Security Scan') {
            steps {
                sh 'npm run check:deps'
            }
        }
        
        stage('Build') {
            steps {
                sh 'npm run build'
            }
        }
        
        stage('Test') {
            steps {
                sh 'npm test'
            }
        }
        
        stage('CDK Diff') {
            steps {
                sh 'npm run cdk diff'
            }
        }
        
        stage('CDK Deploy') {
            when {
                branch 'main'
            }
            steps {
                sh 'npm run cdk deploy -- --require-approval never'
            }
        }
    }
}
```

## Setting Up Webhooks

1. **Configure GitHub Webhooks**:
   - In your GitHub repository, go to Settings → Webhooks → Add webhook
   - Payload URL: `https://your-jenkins-url/github-webhook/`
   - Content type: `application/json`
   - Select events: Push events, Pull request events
   - Add webhook

2. **Configure Jenkins Job for Webhooks**:
   - In your pipeline job, go to Configure
   - Check "GitHub hook trigger for GITScm polling" under Build Triggers
   - Save

## Multi-Environment Deployment

For deploying to multiple environments (dev, staging, prod):

1. **Create Branch-Specific Pipelines**:
   - Clone your pipeline job for each environment
   - Configure each with its appropriate branch
   - Modify the Jenkinsfile ENV variables for each environment

2. **Example Jenkinsfile with Environment Selection**:

```groovy
pipeline {
    agent any
    
    environment {
        ENV_NAME = "${BRANCH_NAME == 'main' ? 'prod' : BRANCH_NAME == 'staging' ? 'staging' : 'dev'}"
    }
    
    stages {
        // Previous stages...
        
        stage('CDK Deploy') {
            steps {
                sh "npm run cdk deploy -- EcsJenkinsGithub${ENV_NAME}Stack --require-approval never"
            }
        }
    }
}
```

## Jenkins Security Hardening

This CDK project includes several security measures for Jenkins:

1. **Network Security**:
   - Jenkins runs in a private subnet
   - WAF protects the ALB fronting Jenkins
   - Security groups limit access to necessary ports

2. **Authentication**:
   - Set up LDAP or OAuth integration for enterprise environments:
     - Manage Jenkins → Configure Global Security → Security Realm

3. **Authorization**:
   - Configure role-based access control:
     - Manage Jenkins → Configure Global Security → Authorization

4. **Credentials Management**:
   - Store sensitive information in AWS Secrets Manager:
     ```typescript
     // In your Jenkins CDK construct:
     const dbCredentials = new secretsmanager.Secret(this, 'JenkinsDbCreds');
     
     // Access in Jenkins via environment variables:
     taskDefinition.addContainer('jenkins', {
       environment: {
         DB_CREDENTIALS_ARN: dbCredentials.secretArn,
       }
     });
     ```

## Troubleshooting

1. **Jenkins Cannot Connect to GitHub**:
   - Check network connectivity from private subnet to GitHub
   - Verify NAT Gateway is properly configured
   - Check credentials and permissions

2. **Pipeline Fails During CDK Deploy**:
   - Check IAM permissions for the Jenkins task role
   - Ensure AWS credentials are properly configured
   - Review CloudFormation errors in AWS console

3. **ECS Service Fails to Start**:
   - Check ECS task execution role permissions
   - Examine container logs for Jenkins startup errors
   - Verify security group allows necessary traffic

4. **Performance Issues**:
   - Scale up the Jenkins ECS task (memory and CPU)
   - Use Jenkins agent scaling for distributed builds
   - Consider using the Amazon ECS agent plugin for dynamic agents

## Backup and Disaster Recovery

1. **Jenkins State Backup**:
   - Configure the EFS volume to be backed up regularly
   - Use AWS Backup to create scheduled backups

2. **Pipeline Configuration as Code**:
   - Store all pipeline configurations in Git
   - Use Jenkins Configuration as Code plugin
   - Create a backup of the JENKINS_HOME directory

## Monitoring and Logging

The CDK stack includes monitoring through:

1. **CloudWatch Logs**:
   - All Jenkins logs are streamed to CloudWatch
   - Create log metric filters for errors

2. **Prometheus Metrics**:
   - Install Prometheus plugin in Jenkins
   - Configure metrics collection

3. **Grafana Dashboards**:
   - Jenkins Performance Dashboard
   - Build Success/Failure Rates
   - Pipeline Duration Metrics