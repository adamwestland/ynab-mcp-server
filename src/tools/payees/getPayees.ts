import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabPayeesResponse } from '../../types/index.js';

/**
 * Input schema for the get payees tool
 */
const GetPayeesInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to get payees for'),
  last_knowledge_of_server: z.number().optional().describe('Server knowledge for delta sync - only return data modified since this value'),
});

type GetPayeesInput = z.infer<typeof GetPayeesInputSchema>;

/**
 * Tool for getting all payees for a budget
 * 
 * This tool retrieves payee information including:
 * - Payee names and metadata
 * - Transfer account associations for internal transfers
 * - Deleted payees (if using delta sync)
 * - Delta sync support for efficient updates
 */
export class GetPayeesTool extends YnabTool {
  name = 'ynab_get_payees';
  description = 'Get all payees for a budget. Includes transfer account associations for internal transfers and supports delta sync for efficient updates.';
  inputSchema = GetPayeesInputSchema;

  /**
   * Execute the get payees tool
   * 
   * @param args Input arguments including budget_id and optional delta sync
   * @returns Payees with transfer account associations and metadata
   */
  async execute(args: unknown): Promise<{
    payees: Array<{
      id: string;
      name: string;
      transfer_account_id: string | null;
      transfer_account_name: string | null;
      deleted: boolean;
    }>;
    server_knowledge: number;
  }> {
    const input = this.validateArgs<GetPayeesInput>(args);

    try {
      const requestOptions = {
        ...(input.last_knowledge_of_server !== undefined && { 
          lastKnowledgeOfServer: input.last_knowledge_of_server 
        }),
      };

      const payeesResponse: YnabPayeesResponse = await this.client.getPayees(
        input.budget_id,
        requestOptions
      );

      // Process and format payee data
      const processedPayees = payeesResponse.payees.map(payee => ({
        id: payee.id,
        name: payee.name,
        transfer_account_id: payee.transfer_account_id,
        transfer_account_name: payee.transfer_account_name,
        deleted: payee.deleted,
      }));

      return {
        payees: processedPayees,
        server_knowledge: payeesResponse.server_knowledge,
      };

    } catch (error) {
      this.handleError(error, 'get payees');
    }
  }
}