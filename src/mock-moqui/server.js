const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 8080;

// In-memory storage for demo
const parties = new Map();
const contactMechs = new Map();
const relationships = new Map();
const organizations = new Map();

// Middleware
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Basic auth middleware (mock)
app.use('/rest', (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const credentials = Buffer.from(auth.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');
  
  if (username !== 'admin' || password !== 'admin') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  next();
});

// Mock Moqui Party API endpoints

// Create Person
app.post('/rest/s1/mantle/party/persons', (req, res) => {
  const { firstName, lastName, partyTypeEnumId, statusId } = req.body;
  
  const partyId = `PERSON_${uuidv4().replace(/-/g, '').substr(0, 10).toUpperCase()}`;
  
  const person = {
    partyId,
    firstName: firstName || '',
    lastName: lastName || '',
    partyTypeEnumId: partyTypeEnumId || 'PtyPerson',
    statusId: statusId || 'PtyEnabled',
    createdDate: new Date().toISOString(),
    lastUpdatedStamp: new Date().toISOString()
  };
  
  parties.set(partyId, person);
  
  console.log(`Created person: ${firstName} ${lastName} (${partyId})`);
  
  res.status(201).json({
    partyId,
    ...person
  });
});

// Get People

app.get('/rest/s1/mantle/party/persons', (req, res) => {
  const { firstName, lastName } = req.query;  
  const matchingParties = Array.from(parties.values())
    .filter(p => p.partyTypeEnumId === 'PtyPerson')
    .filter(p => !firstName || p.firstName.toLowerCase().includes(firstName.toLowerCase()))
    .filter(p => !lastName || p.lastName.toLowerCase().includes(lastName.toLowerCase()));
  
  res.json(matchingParties);
});

// Get Person
app.get('/rest/s1/mantle/party/persons/:partyId', (req, res) => {
  const { partyId } = req.params;
  const person = parties.get(partyId);
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  res.json(person);
});

// Update Person
app.put('/rest/s1/mantle/party/persons/:partyId', (req, res) => {
  const { partyId } = req.params;
  const person = parties.get(partyId);
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  const updatedPerson = {
    ...person,
    ...req.body,
    lastUpdatedStamp: new Date().toISOString()
  };
  
  parties.set(partyId, updatedPerson);
  
  console.log(`Updated person: ${partyId}`);
  
  res.json(updatedPerson);
});

// Create Contact Mechanism
app.post('/rest/s1/mantle/party/:partyId/contactMechs', (req, res) => {
  const { partyId } = req.params;
  const person = parties.get(partyId);
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  const contactMechId = `CM_${uuidv4().replace(/-/g, '').substr(0, 10).toUpperCase()}`;
  
  const contactMech = {
    contactMechId,
    partyId,
    ...req.body,
    createdDate: new Date().toISOString(),
    lastUpdatedStamp: new Date().toISOString()
  };
  
  contactMechs.set(contactMechId, contactMech);
  
  console.log(`Created contact mechanism: ${req.body.contactMechTypeEnumId} for ${partyId}`);
  
  res.status(201).json({
    contactMechId,
    ...contactMech
  });
});

// Get Contact Mechanisms for Party
app.get('/rest/s1/mantle/party/:partyId/contactMechs', (req, res) => {
  const { partyId } = req.params;
  
  const partyContactMechs = Array.from(contactMechs.values())
    .filter(cm => cm.partyId === partyId);
  
  res.json(partyContactMechs);
});

// Create Organization
app.post('/rest/s1/mantle/party/organizations', (req, res) => {
  const { organizationName, partyTypeEnumId, statusId } = req.body;
  
  const partyId = `ORG_${uuidv4().replace(/-/g, '').substr(0, 10).toUpperCase()}`;
  
  const organization = {
    partyId,
    organizationName: organizationName || '',
    partyTypeEnumId: partyTypeEnumId || 'PtyOrganization',
    statusId: statusId || 'PtyEnabled',
    createdDate: new Date().toISOString(),
    lastUpdatedStamp: new Date().toISOString()
  };
  
  organizations.set(partyId, organization);
  parties.set(partyId, organization);
  
  console.log(`Created organization: ${organizationName} (${partyId})`);
  
  res.status(201).json({
    partyId,
    ...organization
  });
});

// Search Organizations
app.get('/rest/s1/mantle/party/organizations', (req, res) => {
  const { organizationName } = req.query;
  
  const matchingOrgs = Array.from(organizations.values())
    .filter(org => !organizationName || 
      org.organizationName.toLowerCase().includes(organizationName.toLowerCase()));
  
  res.json(matchingOrgs);
});

// Create Party Relationship
app.post('/rest/s1/mantle/party/relationships', (req, res) => {
  const relationshipId = `REL_${uuidv4().replace(/-/g, '').substr(0, 10).toUpperCase()}`;
  
  const relationship = {
    relationshipId,
    ...req.body,
    createdDate: new Date().toISOString(),
    lastUpdatedStamp: new Date().toISOString()
  };
  
  relationships.set(relationshipId, relationship);
  
  console.log(`Created relationship: ${req.body.fromPartyId} -> ${req.body.toPartyId} (${req.body.partyRelationshipTypeEnumId})`);
  
  res.status(201).json({
    relationshipId,
    ...relationship
  });
});

// Create Party Role
app.post('/rest/s1/mantle/party/:partyId/roles', (req, res) => {
  const { partyId } = req.params;
  const person = parties.get(partyId);
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  const roleId = `ROLE_${uuidv4().replace(/-/g, '').substr(0, 10).toUpperCase()}`;
  
  const role = {
    roleId,
    partyId,
    ...req.body,
    createdDate: new Date().toISOString(),
    lastUpdatedStamp: new Date().toISOString()
  };
  
  console.log(`Created role: ${req.body.roleTypeId} for ${partyId}`);
  
  res.status(201).json({
    roleId,
    ...role
  });
});

// Create Party Attribute
app.post('/rest/s1/mantle/party/:partyId/attributes', (req, res) => {
  const { partyId } = req.params;
  const person = parties.get(partyId);
  
  if (!person) {
    return res.status(404).json({ error: 'Person not found' });
  }
  
  const attributeId = `ATTR_${uuidv4().replace(/-/g, '').substr(0, 10).toUpperCase()}`;
  
  const attribute = {
    attributeId,
    partyId,
    ...req.body,
    createdDate: new Date().toISOString(),
    lastUpdatedStamp: new Date().toISOString()
  };
  
  console.log(`Created attribute: ${req.body.attrName} = ${req.body.attrValue} for ${partyId}`);
  
  res.status(201).json({
    attributeId,
    ...attribute
  });
});

// System status endpoint
app.get('/rest/s1/mantle/party/status', (req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0-mock',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    counts: {
      parties: parties.size,
      contactMechanisms: contactMechs.size,
      relationships: relationships.size,
      organizations: organizations.size
    }
  });
});

// List all parties (for debugging)
app.get('/rest/s1/mantle/party/debug/parties', (req, res) => {
  res.json({
    parties: Array.from(parties.values()),
    contactMechanisms: Array.from(contactMechs.values()),
    relationships: Array.from(relationships.values())
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Mock Moqui Framework API',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      'POST /rest/s1/mantle/party/persons',
      'GET /rest/s1/mantle/party/persons/:partyId',
      'PUT /rest/s1/mantle/party/persons/:partyId',
      'POST /rest/s1/mantle/party/:partyId/contactMechs',
      'GET /rest/s1/mantle/party/:partyId/contactMechs',
      'POST /rest/s1/mantle/party/organizations',
      'GET /rest/s1/mantle/party/organizations',
      'POST /rest/s1/mantle/party/relationships',
      'POST /rest/s1/mantle/party/:partyId/roles',
      'POST /rest/s1/mantle/party/:partyId/attributes',
      'GET /rest/s1/mantle/party/status'
    ],
    authentication: 'Basic Auth (admin/admin)',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Mock Moqui Framework API started on port ${port}`);
  console.log(`Access the API at: http://localhost:${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`API Status: http://localhost:${port}/rest/s1/mantle/party/status`);
  console.log(`Authentication: Basic admin/admin`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;