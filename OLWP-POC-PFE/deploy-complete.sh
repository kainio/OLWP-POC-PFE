#!/bin/bash

# Complete Data Pipeline Deployment Script
# Phases 1-4: Grafana → Git → Validation → Moqui Integration



check_health() {
    local URL=$1

    local TIMEOUT=60  # seconds
    local INTERVAL=5  # seconds

    echo "Waiting for health check at $URL..."

    local start_time=$(date +%s)
    while true; do
        local current_time=$(date +%s)
        local elapsed_time=$((current_time - start_time))

        if [ "$elapsed_time" -ge "$TIMEOUT" ]; then
            echo "Timeout reached. Health check failed after $TIMEOUT seconds."
            return 1
        fi

        # Perform the health check (e.g., check HTTP status code)
        local HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$URL")

        if [ "$HTTP_STATUS" -eq 200 ]; then
            echo "Health check successful! Service is healthy."
            return 0
        else
            echo "Health check failed (HTTP Status: $HTTP_STATUS). Retrying in $INTERVAL seconds..."
            sleep "$INTERVAL"
        fi
    done
}

set -e

echo "🚀 Deploying Complete Data-Driven App Platform (Phases 1-4)"
echo "============================================================"

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

if ! command -v ansible &> /dev/null; then
    echo "❌ Ansible not found. Please install Ansible first."
    exit 1
fi


echo "✅ Prerequisites check passed"

# Create necessary directories
echo "📁 Creating required directories..."
mkdir -p integration-service/logs
echo "✅ Directories created"


# Generate .env file from template
touch .env

# Provision CDM Data Ansible
echo "🏗️ Running Ansible playbook to provision Gitea..."
ansible-playbook ./ansible/provision-gitea-docker.yml

docker compose restart gitea

# Provision CDM Data Ansible
echo "🏗️ Running Ansible playbook to provision CDM Data Repo"
ansible-playbook ./ansible/provision-cdm-data-ansible.yml

echo "🏗️ Building all services..."
docker compose build --no-cache
if [ $? -ne 0 ]; then
    echo "❌ Failed to build services. Please check the Dockerfile and docker-compose.yml."
    exit 1
fi
echo "✅ Services built successfully"


# Start all services
echo "🏗️ Building and starting all services..."
docker compose up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start services. Please check the Docker Compose configuration."
    exit 1
fi
echo "✅ Services started successfully"


# Health checks
echo "🏥 Performing health checks..."

if check_health "http://localhost:3401/api/health" > /dev/null 2>&1; then
    echo "✅ Integration Service is healthy"
else
    echo "❌ Integration Service health check failed"
    docker compose logs integration-service
fi

# Check Mock Moqui

if check_health "http://localhost:8480/health"> /dev/null 2>&1; then
    echo "✅ Mock Moqui Service is healthy"
else
    echo "❌ Mock Moqui Service health check failed"
    docker compose logs mock-moqui
fi

# Check Grafana
if check_health "http://localhost:3410/api/health"> /dev/null 2>&1; then
    echo "✅ Grafana Service is healthy"
else
    echo "❌ Grafana Service health check failed"
    docker compose logs grafana
fi

echo ""
echo "🎯 Running integration tests..."

# Test Phase 1 & 2 (Data Input & Processing)
echo "🧪 Testing Phase 1 & 2: Data Input and Processing"
PHASE_1_2_TEST=$(curl -s -X POST http://localhost:3401/api/data/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}')

if echo "$PHASE_1_2_TEST" | grep -q '"success":true'; then
    echo "✅ Phase 1 & 2 test passed"
else
    echo "❌ Phase 1 & 2 test failed"
    echo "$PHASE_1_2_TEST"
fi

# Test Reference Data (OpenSearch)
echo "🧪 Testing Reference Data System"
REF_DATA_TEST=$(curl -s http://localhost:3401/api/data/reference)

if echo "$REF_DATA_TEST" | grep -q '"success":true'; then
    echo "✅ Reference data system test passed"
else
    echo "❌ Reference data system test failed"
fi

# Test Mock Moqui Integration
echo "🧪 Testing Mock Moqui Integration"
MOQUI_TEST=$(curl -s http://localhost:3401/api/data/moqui/health)

if echo "$MOQUI_TEST" | grep -q '"success":true'; then
    echo "✅ Moqui integration test passed"
else
    echo "❌ Moqui integration test failed"
    echo "$MOQUI_TEST"
fi

# Test Complete Flow (All Phases)
echo "🧪 Testing Complete Flow (Phases 1-4)"
COMPLETE_FLOW_TEST=$(curl -s -X POST http://localhost:3401/api/data/test/complete-flow)

if echo "$COMPLETE_FLOW_TEST" | grep -q '"success":true'; then
    echo "✅ Complete flow test passed - All phases working!"

    # Extract test details
    echo "$COMPLETE_FLOW_TEST" | grep -o '"testId":"[^"]*"' | cut -d'"' -f4 | head -1 | while read testId; do
        echo "   📊 Test ID: $testId"
    done
    if echo "$COMPLETE_FLOW_TEST" | grep -q '"moquiSynced":true'; then
        echo "   ✅ Data successfully synced to Moqui"
        echo "$COMPLETE_FLOW_TEST" | grep -o '"moquiId":"[^"]*"' | cut -d'"' -f4 | head -1 | while read moquiId; do
            echo "      📦 Moqui ID: $moquiId"
        done
    fi

else
    echo "❌ Complete flow test failed"
    echo "$COMPLETE_FLOW_TEST"
    exit 1
fi


echo ""
echo "🎉 Deployment Complete!"
echo "======================="
echo ""
echo "📊 Service Access URLs:"
echo "   • Grafana Dashboard:      http://localhost:3410 (admin/admin123)"
echo "   • Gitea Repository:       http://localhost:3402 (gitea_admin/admin123)"
echo "   • Integration Service:    http://localhost:3401"
echo "   • Mock Moqui Framework:   http://localhost:8480"
echo "   • OpenSearch Dashboards:  http://localhost:5601"
echo ""
echo "🔗 Key API Endpoints:"
echo "   • Health Check:           curl http://localhost:3401/api/health"
echo "   • Submit Contact:         curl -X POST http://localhost:3401/api/data/contacts"
echo "   • Search Contacts:        curl http://localhost:3401/api/data/contacts"
echo "   • Reference Data:         curl http://localhost:3401/api/data/reference"
echo "   • Test Complete Flow:     curl -X POST http://localhost:3401/api/data/test/complete-flow"
echo "   • View Notifications:     curl http://localhost:3401/api/data/notifications"
echo ""
echo "🧪 Testing Commands:"
echo "   • Test CDM Transformation: curl -X POST http://localhost:3401/api/data/test"
echo "   • Test Moqui Health:       curl http://localhost:3401/api/data/moqui/health"
echo "   • Complete Flow Test:      curl -X POST http://localhost:3401/api/data/test/complete-flow"
echo ""
echo ""
echo "🎯 Data Flow Summary:"
echo "   Phase 1: Grafana Form → Data Input & Validation"
echo "   Phase 2: CDM Transformation → Git Storage → OpenSearch Indexing"
echo "   Phase 3: CI/CD Validation → Business Rules → Review Workflow"
echo "   Phase 4: Auto-merge → Moqui Sync → Notifications"
echo ""
echo ""
echo "🚀 All services are up and running! You can now start using the platform."