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
fi
