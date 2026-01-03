# YNAB MCP Server

A comprehensive Model Context Protocol (MCP) server that provides access to YNAB (You Need A Budget) data. This server enables AI assistants like Claude Code to interact with your YNAB budgets, accounts, transactions, and provides advanced features like automated budget allocation recommendations and spending pattern analysis.

## 🌟 Features

### Core Functionality
- **Complete Budget Management**: List budgets, accounts, categories with full metadata
- **Advanced Transaction Operations**: CRUD operations, batch updates, split transactions, transfers
- **Category Management**: Budget allocation, goal tracking, spending analysis
- **Payee Management**: Create, retrieve, and manage payees across budgets
- **Scheduled Transactions**: Full lifecycle management of recurring transactions
- **Import Capabilities**: Bulk transaction import with validation

### Analysis & Automation Features
- **Automated Budget Allocation**: Recommendations based on spending patterns and goals
- **Spending Pattern Analysis**: Identify trends, anomalies, and optimization opportunities
- **Transfer Detection**: Automatic linking and management of account transfers
- **Goal-Based Budgeting**: Recommendations aligned with your financial goals

### Technical Excellence
- **Rate Limiting**: Built-in respect for YNAB API limits with automatic retry logic
- **Error Handling**: Comprehensive error handling with detailed diagnostics
- **Type Safety**: Full TypeScript support with extensive type definitions
- **Delta Sync**: Efficient synchronization using YNAB's server knowledge system

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- YNAB account with API access
- YNAB API Token ([get from YNAB Developer Settings](https://app.youneedabudget.com/settings/developer))

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repository-url>
cd ynab-mcp-server
npm install
```

2. **Configure your API token:**
```bash
cp .env.example .env
# Edit .env and set your YNAB_API_TOKEN
```

3. **Build the project:**
```bash
npm run build
```

4. **Test the installation:**
```bash
npm start
```

### Using with Claude Code

1. **Configure Claude Code MCP settings:**
```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/absolute/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

2. **Start using YNAB tools in Claude Code:**
```
Can you show me my budget accounts and recent transactions?
Analyze my spending patterns for the last 6 months.
Help me allocate my available funds across categories.
```

## 🛠️ Complete Tool Reference

This server provides **30+ specialized tools** organized into these categories:

### Budget & Account Management (3 tools)
- `ynab_list_budgets` - Get all accessible budgets with metadata
- `ynab_get_accounts` - Retrieve account details, balances, and settings
- `ynab_get_budget_month` - Get monthly budget data with category allocations

### Transaction Management (9 tools)
- `ynab_get_transactions` - Query transactions with advanced filtering
- `ynab_create_transaction` - Create individual transactions
- `ynab_update_transaction` - Update existing transactions
- `ynab_delete_transaction` - Remove transactions
- `ynab_create_split_transaction` - Create complex split transactions
- `ynab_update_transaction_splits` - Modify split transaction details
- `ynab_batch_update_transactions` - Bulk transaction operations
- `ynab_import_transactions` - Import transactions from external sources
- `ynab_link_transfer` - Link transactions as transfers between accounts
- `ynab_unlink_transfer` - Remove transfer links

### Category & Budget Management (3 tools)
- `ynab_get_categories` - Get category groups and individual categories
- `ynab_get_category` - Get detailed category information
- `ynab_update_category_budget` - Adjust category budget allocations

### Payee Management (3 tools)
- `ynab_get_payees` - List all payees with metadata
- `ynab_get_payee` - Get specific payee details
- `ynab_create_payee` - Add new payees

### Scheduled Transactions (5 tools)
- `ynab_get_scheduled_transactions` - List recurring transactions
- `ynab_get_scheduled_transaction` - Get specific scheduled transaction
- `ynab_create_scheduled_transaction` - Set up recurring transactions
- `ynab_update_scheduled_transaction` - Modify scheduled transactions
- `ynab_delete_scheduled_transaction` - Remove scheduled transactions

### Analysis & Allocation (3 tools)
- `ynab_recommend_category_allocation` - Pattern-based budget recommendations
- `ynab_analyze_spending_patterns` - Comprehensive spending analysis
- `ynab_distribute_to_be_budgeted` - Automated distribution of available funds

For detailed documentation of all tools, see [docs/TOOL_REFERENCE.md](docs/TOOL_REFERENCE.md).

## 📚 Usage Examples

### Basic Operations
```javascript
// Get all budgets
await tools.ynab_list_budgets({
  include_accounts: true
});

// Get recent transactions
await tools.ynab_get_transactions({
  budget_id: "your-budget-id",
  since_date: "2024-01-01",
  limit: 100
});
```

### Analysis & Allocation
```javascript
// Get budget recommendations based on spending patterns
await tools.ynab_recommend_category_allocation({
  budget_id: "your-budget-id",
  strategy: "balanced",
  analysis_months: 6,
  available_funds: 500000 // $500 in milliunits
});

// Analyze spending patterns
await tools.ynab_analyze_spending_patterns({
  budget_id: "your-budget-id",
  analysis_months: 12,
  include_forecasting: true
});
```

For comprehensive examples, see the [examples/](examples/) directory:
- [Basic Usage](examples/basic-usage.md) - Getting started with core operations
- [Budget Management](examples/budget-management.md) - Category and budget operations
- [Transaction Management](examples/transaction-management.md) - CRUD and batch operations
- [Transfer Detection](examples/transfer-detection.md) - Managing account transfers
- [Spending Analysis](examples/spending-analysis.md) - Analysis and allocation features
- [Scheduled Transactions](examples/scheduled-transactions.md) - Recurring transactions

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `YNAB_API_TOKEN` | ✅ | - | Your YNAB API token from developer settings |
| `YNAB_BASE_URL` | ❌ | `https://api.youneedabudget.com/v1` | YNAB API base URL |
| `RATE_LIMIT_REQUESTS` | ❌ | `200` | Maximum requests per hour |
| `RATE_LIMIT_WINDOW_MS` | ❌ | `3600000` | Rate limit window in milliseconds |

### Rate Limiting & Error Handling

The server includes sophisticated rate limiting and error handling:

- **Rate Limiting**: Respects YNAB's 200 requests/hour limit with exponential backoff
- **Automatic Retry**: Exponential backoff for transient failures
- **Connection Monitoring**: Health checks and connection status reporting
- **Detailed Error Messages**: Comprehensive error categorization and helpful diagnostics

### MCP Client Configuration

For detailed MCP client setup instructions, see [docs/MCP_CONFIGURATION.md](docs/MCP_CONFIGURATION.md).

**Basic Configuration:**
```json
{
  "mcpServers": {
    "ynab": {
      "command": "node",
      "args": ["/absolute/path/to/ynab-mcp-server/dist/index.js"],
      "env": {
        "YNAB_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

## 🏗️ Development

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build TypeScript to JavaScript |
| `npm run dev` | Development mode with auto-reload |
| `npm run start` | Run the built production server |
| `npm run test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Check TypeScript compilation |
| `npm run clean` | Remove build artifacts |

### Project Architecture

```
src/
├── client/              # YNAB API client with rate limiting and error handling
│   ├── YNABClient.ts   # Main API client class
│   ├── RateLimiter.ts  # Rate limiting implementation
│   └── ErrorHandler.ts # Comprehensive error handling
├── config/             # Configuration management
├── tools/              # MCP tool implementations
│   ├── budgets/        # Budget and account tools
│   ├── transactions/   # Transaction CRUD and batch operations
│   ├── categories/     # Category and budget management
│   ├── payees/         # Payee management
│   ├── scheduled/      # Scheduled transaction tools
│   ├── transfers/      # Transfer linking tools
│   ├── imports/        # Transaction import tools
│   └── analysis/       # Spending analysis and allocation
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
├── auth/               # Authentication helpers
├── server.ts           # MCP server implementation
└── index.ts            # Application entry point
```

### Adding New Tools

To add a new tool:

1. Create a new tool file in the appropriate directory under `src/tools/`
2. Extend the `YnabTool` base class
3. Implement required methods (`name`, `description`, `inputSchema`, `execute`)
4. Add the tool to `src/tools/index.ts`
5. Add tests in the `tests/` directory

Example:
```typescript
import { z } from 'zod';
import { YnabTool } from '../base.js';

const MyToolInputSchema = z.object({
  budget_id: z.string(),
  // ... other parameters
});

export class MyTool extends YnabTool {
  name = 'ynab_my_tool';
  description = 'Description of what this tool does';
  inputSchema = MyToolInputSchema;

  async execute(args: unknown) {
    const input = this.validateArgs<z.infer<typeof MyToolInputSchema>>(args);
    // Implementation here
    return result;
  }
}
```

## 🔧 Troubleshooting

### Common Issues

**Server won't start:**
- Verify Node.js version (18+)
- Check YNAB_API_TOKEN is set correctly
- Ensure all dependencies are installed (`npm install`)

**Rate limit errors:**
- Default limit is 200 requests/hour
- The server automatically handles rate limiting with backoff
- Check for excessive polling or batch operations

**Authentication failures:**
- Verify your YNAB API token is valid
- Check token permissions in YNAB developer settings
- Ensure token hasn't expired

**Tool not found errors:**
- Verify server is running and connected
- Check MCP client configuration
- Restart both server and MCP client

### Debug Mode

Enable verbose logging by setting:
```bash
export DEBUG=ynab-mcp-server:*
npm start
```

### Health Check

The server includes a built-in health check:
```javascript
// Access via MCP client to check server status
// Health check tests YNAB API connectivity and rate limit status
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Submit a pull request

### Development Guidelines

- Follow existing code patterns and TypeScript conventions
- Add comprehensive error handling
- Include input validation with Zod schemas
- Write tests for new tools and functionality
- Update documentation for new features

## 🆘 Support

**Need help?**

- **YNAB API Issues**: [YNAB API Documentation](https://api.youneedabudget.com/)
- **MCP Protocol**: [Model Context Protocol Documentation](https://github.com/modelcontextprotocol)
- **Server Issues**: Open an issue on GitHub
- **Feature Requests**: Submit a GitHub issue with the "enhancement" label

**Useful Resources:**

- [YNAB Developer Documentation](https://api.youneedabudget.com/)
- [Claude Code Documentation](https://claude.ai/code)
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)

---

Built with ❤️ for the YNAB community. Happy budgeting!