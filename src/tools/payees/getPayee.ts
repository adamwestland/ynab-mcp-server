import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabPayeeResponse } from '../../types/index.js';

/**
 * Input schema for the get payee tool
 */
const GetPayeeInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget containing the payee'),
  payee_id: z.string().describe('The ID of the payee to retrieve'),
});

type GetPayeeInput = z.infer<typeof GetPayeeInputSchema>;

/**
 * Tool for getting a single payee by ID
 * 
 * This tool retrieves detailed information for a specific payee including:
 * - Payee name and metadata
 * - Transfer account association if this is a transfer payee
 * - Deletion status
 */
export class GetPayeeTool extends YnabTool {
  name = 'ynab_get_payee';
  description = 'Get a single payee by ID. Includes full payee details and transfer account association if applicable.';
  inputSchema = GetPayeeInputSchema;

  /**
   * Execute the get payee tool
   * 
   * @param args Input arguments including budget_id and payee_id
   * @returns Detailed payee information
   */
  async execute(args: unknown): Promise<{
    payee: {
      id: string;
      name: string;
      transfer_account_id: string | null;
      transfer_account_name: string | null;
      deleted: boolean;
    };
  }> {
    const input = this.validateArgs<GetPayeeInput>(args);

    try {
      const payeeResponse: YnabPayeeResponse = await this.client.getPayee(
        input.budget_id,
        input.payee_id
      );

      const payee = payeeResponse.payee;

      // Process and format payee data
      const processedPayee = {
        id: payee.id,
        name: payee.name,
        transfer_account_id: payee.transfer_account_id,
        transfer_account_name: payee.transfer_account_name,
        deleted: payee.deleted,
      };

      return {
        payee: processedPayee,
      };

    } catch (error) {
      this.handleError(error, 'get payee');
    }
  }
}