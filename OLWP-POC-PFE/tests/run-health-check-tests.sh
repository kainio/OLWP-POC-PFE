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

