pipeline {
    agent any
    
    environment {
        AWS_REGION = 'us-east-1'
        NODE_ENV = 'production'
        CDK_DEFAULT_ACCOUNT = credentials('AWS_ACCOUNT_ID')
        CDK_DEFAULT_REGION = "${AWS_REGION}"
        // Define secrets to be loaded from Jenkins credentials store
        DB_CREDS = credentials('db-credentials')
        GRAFANA_ADMIN_CREDS = credentials('grafana-admin')
    }
    
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        
        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }
        
        stage('Security & Static Analysis') {
            parallel {
                stage('Lint') {
                    steps {
                        sh 'npm run lint'
                    }
                }
                
                stage('Dependency Check') {
                    steps {
                        sh 'npm audit --audit-level=moderate'
                    }
                }
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
        
        stage('CDK Synth') {
            steps {
                // Set the environment variables for the CDK
                withEnv(['DB_USERNAME=${DB_CREDS_USR}',
                         'DB_PASSWORD=${DB_CREDS_PSW}',
                         'GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_CREDS_PSW}']) {
                    sh 'npx cdk synth'
                }
            }
        }
        
        stage('CDK Diff') {
            steps {
                withEnv(['DB_USERNAME=${DB_CREDS_USR}',
                         'DB_PASSWORD=${DB_CREDS_PSW}',
                         'GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_CREDS_PSW}']) {
                    sh 'npx cdk diff EcsJenkinsGithubDevStack'
                }
            }
        }
        
        stage('CDK Deploy') {
            when {
                branch 'main'
            }
            steps {
                withEnv(['DB_USERNAME=${DB_CREDS_USR}',
                         'DB_PASSWORD=${DB_CREDS_PSW}',
                         'GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_CREDS_PSW}']) {
                    sh 'npx cdk deploy EcsJenkinsGithubDevStack --require-approval never'
                }
            }
        }
    }
    
    post {
        always {
            // Clean up workspace
            cleanWs()
        }
        success {
            echo 'Deployment completed successfully!'
        }
        failure {
            echo 'Deployment failed!'
        }
    }
}