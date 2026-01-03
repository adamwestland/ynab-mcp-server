# MCP Configuration Guide

This guide provides detailed instructions for configuring MCP (Model Context Protocol) clients to work with the YNAB MCP Server. Learn how to set up Claude Code, other MCP clients, and troubleshoot common configuration issues.

## Table of Contents

- [Overview](#overview)
- [Claude Code Configuration](#claude-code-configuration)
- [Other MCP Clients](#other-mcp-clients)
- [Environment Setup](#environment-setup)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

---

## Overview

### What is MCP?

The Model Context Protocol (MCP) is a standardized protocol that enables AI assistants to securely connect to external data sources and services. The YNAB MCP Server implements this protocol to provide AI assistants with access to your YNAB budget data.

### Prerequisites

Before configuring any MCP client, ensure you have:

1. **YNAB Account**: Active YNAB subscription with budget data
2. **YNAB API Token**: Generated from [YNAB Developer Settings](https://app.youneedabudget.com/settings/developer)
3. **YNAB MCP Server**: Installed and built (see main README.md)
4. **Node.js 18+**: Required to run the server
5. **MCP Client**: Claude Code or another MCP-compatible client

### Basic Architecture

```
┌─────────────────┐    MCP Protocol    ┌──────────────────┐    YNAB API    ┌─────────────┐
│   AI Assistant  │ ←────────────────→ │ YNAB MCP Server  │ ←──────────────→ │    YNAB     │
│  (Claude Code)  │                    │                  │                 │   Service   │
└─────────────────┘                    └──────────────────┘                 └─────────────┘
```

---

## Claude Code Configuration

### Step 1: Locate Configuration File

Claude Code stores MCP server configurations in a JSON file:

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%\Claude\claude_desktop_config.json
```

**Linux:**
```bash
~/.config/claude/claude_desktop_config.json
```

### Step 2: Basic Configuration

Create or edit the configuration file with the following structure:

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/absolute/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "your_actual_api_token_here"
      }
    }
  }
}
```

**Important Notes:**
- Use the **absolute path** to your server's `dist/index.js` file
- Replace `your_actual_api_token_here` with your real YNAB API token
- Ensure the server is built (`npm run build`) before configuration

### Step 3: Advanced Claude Code Configuration

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/absolute/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "your_api_token",
        "YNAB_BASE_URL": "https://api.youneedabudget.com/v1",
        "RATE_LIMIT_REQUESTS": "200",
        "RATE_LIMIT_WINDOW_MS": "3600000",
        "NODE_ENV": "production"
      }
    }
  },
  "globalShortcut": "CommandOrControl+Shift+C"
}
```

### Step 4: Verify Configuration

1. **Restart Claude Code** completely (quit and reopen)
2. **Check for the server** in Claude Code's MCP server list
3. **Test with a simple request**: "Show me my YNAB budgets"

If successful, you should see the YNAB tools available and receive budget data.

---

## Other MCP Clients

### Generic MCP Client Configuration

For MCP clients that use JSON configuration:

```json
{
  "servers": {
    "ynab": {
      "command": "node",
      "args": ["/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "your_token"
      }
    }
  }
}
```

### MCP Client Libraries

If you're building a custom MCP client, connect to the server using the MCP SDK:

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

// Start the YNAB MCP Server process
const serverProcess = spawn('node', ['/path/to/ynab-mcp-server/dist/index.js'], {
  env: {
    ...process.env,
    YNAB_API_TOKEN: 'your_token_here'
  }
});

// Create MCP client
const transport = new StdioClientTransport({
  command: serverProcess
});

const client = new Client({
  name: 'ynab-client',
  version: '1.0.0'
}, {
  capabilities: {}
});

// Connect to server
await client.connect(transport);

// List available tools
const tools = await client.listTools();
console.log('Available YNAB tools:', tools);
```

### Command Line Testing

Test the server directly from the command line:

```bash
# Set environment variable
export YNAB_API_TOKEN="your_token_here"

# Run the server
node /path/to/ynab-mcp-server/dist/index.js

# The server will start and listen for MCP protocol messages on stdio
```

---

## Environment Setup

### Environment Variables

The YNAB MCP Server supports these environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YNAB_API_TOKEN` | ✅ | - | Your YNAB API token |
| `YNAB_BASE_URL` | ❌ | `https://api.youneedabudget.com/v1` | YNAB API base URL |
| `RATE_LIMIT_REQUESTS` | ❌ | `200` | Max requests per hour |
| `RATE_LIMIT_WINDOW_MS` | ❌ | `3600000` | Rate limit window (1 hour) |
| `NODE_ENV` | ❌ | `development` | Node environment |
| `DEBUG` | ❌ | - | Debug logging (set to `ynab-mcp-server:*`) |

### .env File Setup

For local development, create a `.env` file in the server root:

```bash
# .env file
YNAB_API_TOKEN=your_token_here
YNAB_BASE_URL=https://api.youneedabudget.com/v1
RATE_LIMIT_REQUESTS=200
RATE_LIMIT_WINDOW_MS=3600000
NODE_ENV=production
DEBUG=ynab-mcp-server:*
```

**Security Warning**: Never commit `.env` files with real API tokens to version control.

### System Environment Variables

Set system-wide environment variables for permanent configuration:

**macOS/Linux:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export YNAB_API_TOKEN="your_token_here"

# Or set temporarily
YNAB_API_TOKEN="your_token" node dist/index.js
```

**Windows:**
```cmd
# Set permanently
setx YNAB_API_TOKEN "your_token_here"

# Or temporarily
set YNAB_API_TOKEN=your_token_here && node dist\index.js
```

---

## Security Considerations

### API Token Security

1. **Never Share Your Token**: Your YNAB API token provides full access to your budget data
2. **Use Environment Variables**: Don't hardcode tokens in configuration files
3. **Regenerate if Compromised**: Generate a new token if you suspect it's been exposed
4. **Limit Access**: Only install the server on trusted computers

### Configuration File Security

1. **Restrict File Permissions**: Ensure configuration files are only readable by you
   ```bash
   chmod 600 ~/.config/claude/claude_desktop_config.json
   ```

2. **Avoid Version Control**: Don't commit configuration files with real tokens
3. **Use Secrets Management**: Consider using a secrets manager for production deployments

### Network Security

1. **Local Only**: The MCP server only runs locally and doesn't expose network ports
2. **HTTPS**: All communication with YNAB uses HTTPS
3. **Rate Limiting**: Built-in rate limiting protects against API abuse

---

## Troubleshooting

### Common Issues

#### 1. "Server not found" or "MCP server failed to start"

**Symptoms**: Claude Code shows the server as unavailable or failed

**Solutions**:
1. **Check the path**: Ensure the path to `dist/index.js` is absolute and correct
2. **Verify build**: Run `npm run build` in the server directory
3. **Check Node.js**: Ensure Node.js 18+ is installed and in PATH
4. **Test manually**: Run the server directly to see error messages

**Debug Steps**:
```bash
# Test Node.js version
node --version

# Test server directly
cd /path/to/ynab-mcp-server
YNAB_API_TOKEN="your_token" node dist/index.js

# Check if dist folder exists and has index.js
ls -la dist/
```

#### 2. "Invalid or expired YNAB API token"

**Symptoms**: Server starts but API calls fail with authentication errors

**Solutions**:
1. **Regenerate token**: Get a new token from YNAB Developer Settings
2. **Check token format**: Ensure there are no extra spaces or characters
3. **Test token**: Verify the token works with YNAB's API directly

**Debug Steps**:
```bash
# Test token directly with YNAB API
curl -H "Authorization: Bearer your_token_here" \
  https://api.youneedabudget.com/v1/budgets

# Should return JSON with budget data, not an error
```

#### 3. "Rate limit exceeded" errors

**Symptoms**: Requests fail with rate limit messages

**Solutions**:
1. **Wait**: YNAB allows 200 requests per hour, wait for the limit to reset
2. **Reduce frequency**: Avoid rapid consecutive requests
3. **Check for loops**: Ensure no infinite loops are making repeated calls

**Monitor Rate Limits**:
```bash
# Enable debug logging to see rate limit status
DEBUG=ynab-mcp-server:* node dist/index.js
```

#### 4. "Tool not found" errors

**Symptoms**: Claude Code can't find specific YNAB tools

**Solutions**:
1. **Restart client**: Restart Claude Code completely
2. **Check server logs**: Look for tool registration errors
3. **Verify build**: Ensure the server built successfully
4. **Test tool list**: Manually check if tools are registered

#### 5. Configuration file issues

**Symptoms**: Configuration doesn't seem to take effect

**Solutions**:
1. **Check JSON syntax**: Use a JSON validator to verify syntax
2. **Restart completely**: Quit and restart Claude Code entirely
3. **Check file location**: Ensure config file is in the correct location
4. **Verify permissions**: Ensure the config file is readable

**JSON Validation**:
```bash
# Test JSON syntax
node -e "console.log(JSON.parse(require('fs').readFileSync('/path/to/config.json')))"
```

### Debug Mode

Enable comprehensive debugging:

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node", 
      "args": ["/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "your_token",
        "DEBUG": "ynab-mcp-server:*",
        "NODE_ENV": "development"
      }
    }
  }
}
```

### Log Analysis

Check logs for common patterns:

**Successful startup**:
```
YNAB MCP Server started with 30 tools
Registered 30 YNAB tools
```

**Authentication issues**:
```
YNAB API health check failed: Invalid token
Authentication failed: 401 Unauthorized
```

**Rate limiting**:
```
Rate limit exceeded, retrying in 3600 seconds
HTTP 429: Rate limit exceeded
```

---

## Advanced Configuration

### Multiple Environment Setup

Configure different environments (development, production):

```json
{
  "mcpServers": {
    "ynab-dev": {
      "command": "node",
      "args": ["/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "dev_token",
        "NODE_ENV": "development",
        "DEBUG": "ynab-mcp-server:*"
      }
    },
    "ynab-prod": {
      "command": "node", 
      "args": ["/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "prod_token",
        "NODE_ENV": "production",
        "RATE_LIMIT_REQUESTS": "150"
      }
    }
  }
}
```

### Custom Rate Limiting

Adjust rate limiting for your usage patterns:

```json
{
  "env": {
    "YNAB_API_TOKEN": "your_token",
    "RATE_LIMIT_REQUESTS": "100",    // More conservative limit
    "RATE_LIMIT_WINDOW_MS": "1800000" // 30-minute window
  }
}
```

### Health Check Monitoring

Set up monitoring for server health:

```javascript
// Custom health check script
const { spawn } = require('child_process');

const server = spawn('node', ['/path/to/server/dist/index.js'], {
  env: { YNAB_API_TOKEN: process.env.YNAB_API_TOKEN }
});

server.stderr.on('data', (data) => {
  const message = data.toString();
  if (message.includes('YNAB MCP Server started')) {
    console.log('✅ Server started successfully');
  }
  if (message.includes('health check failed')) {
    console.error('❌ Health check failed');
  }
});
```

### Automated Configuration Management

Script to generate configurations:

```bash
#!/bin/bash
# generate-config.sh

YNAB_TOKEN="${1:-}"
CONFIG_PATH="${2:-$HOME/.config/claude/claude_desktop_config.json}"
SERVER_PATH="${3:-$(pwd)/dist/index.js}"

if [ -z "$YNAB_TOKEN" ]; then
  echo "Usage: $0 <YNAB_API_TOKEN> [config_path] [server_path]"
  exit 1
fi

cat > "$CONFIG_PATH" << EOF
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["$SERVER_PATH"],
      "env": {
        "YNAB_API_TOKEN": "$YNAB_TOKEN"
      }
    }
  }
}
EOF

echo "Configuration written to $CONFIG_PATH"
echo "Restart Claude Code to apply changes"
```

### Docker Configuration

For containerized deployments:

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY docs/ ./docs/
COPY examples/ ./examples/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  ynab-mcp-server:
    build: .
    environment:
      - YNAB_API_TOKEN=${YNAB_API_TOKEN}
      - NODE_ENV=production
    volumes:
      - ./logs:/app/logs
```

---

## Configuration Templates

### Basic Configuration Template

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["REPLACE_WITH_ABSOLUTE_PATH/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "REPLACE_WITH_YOUR_TOKEN"
      }
    }
  }
}
```

### Development Configuration Template

```json
{
  "mcpServers": {
    "ynab-dev": {
      "command": "node",
      "args": ["REPLACE_WITH_ABSOLUTE_PATH/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "REPLACE_WITH_YOUR_TOKEN",
        "NODE_ENV": "development",
        "DEBUG": "ynab-mcp-server:*",
        "RATE_LIMIT_REQUESTS": "300"
      }
    }
  }
}
```

### Production Configuration Template

```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["REPLACE_WITH_ABSOLUTE_PATH/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "REPLACE_WITH_YOUR_TOKEN",
        "NODE_ENV": "production",
        "RATE_LIMIT_REQUESTS": "180",
        "RATE_LIMIT_WINDOW_MS": "3600000"
      }
    }
  }
}
```

---

## Verification Steps

After configuration, verify everything works:

1. **Restart the MCP client** (Claude Code, etc.)
2. **Check server appears** in the client's server list
3. **Test basic functionality**: "Show me my YNAB budgets"
4. **Verify tools are available**: Ask for a list of available YNAB operations
5. **Test a complex operation**: Try creating or updating a transaction
6. **Monitor for errors**: Watch for rate limits or authentication issues

## Getting Help

If you encounter issues not covered in this guide:

1. **Check the main README.md** for basic setup instructions
2. **Review the troubleshooting section** above
3. **Enable debug logging** to see detailed error messages
4. **Test the server independently** outside of the MCP client
5. **Check YNAB API status** at [status.youneedabudget.com](https://status.youneedabudget.com)
6. **Open an issue** on the project's GitHub repository with:
   - Your configuration (with token redacted)
   - Error messages from logs
   - Steps to reproduce the issue
   - System information (OS, Node.js version, client version)

---

This configuration guide should help you successfully connect any MCP client to the YNAB MCP Server. The key is ensuring correct paths, valid API tokens, and proper environment variable setup.