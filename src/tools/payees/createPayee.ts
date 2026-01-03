import { z } from 'zod';
import { YnabTool } from '../base.js';
import type { YnabPayeeResponse } from '../../types/index.js';

/**
 * Input schema for the create payee tool
 */
const CreatePayeeInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to create the payee in'),
  name: z.string().min(1).max(50).describe('The name of the payee (1-50 characters)'),
});

type CreatePayeeInput = z.infer<typeof CreatePayeeInputSchema>;

/**
 * Tool for creating a new payee
 * 
 * This tool creates a new payee in the specified budget and handles:
 * - Payee name validation
 * - Duplicate name conflict detection
 * - Creation of non-transfer payees only
 */
export class CreatePayeeTool extends YnabTool {
  name = 'ynab_create_payee';
  description = 'Create a new payee in a budget. Handles duplicate name conflicts and validates payee names. Cannot create transfer payees - those are created automatically with accounts.';
  inputSchema = CreatePayeeInputSchema;

  /**
   * Execute the create payee tool
   * 
   * @param args Input arguments including budget_id and payee name
   * @returns Created payee information
   */
  async execute(args: unknown): Promise<{
    payee: {
      id: string;
      name: string;
      transfer_account_id: string | null;
      transfer_account_name: string | null;
      deleted: boolean;
    };
    server_knowledge: number;
  }> {
    const input = this.validateArgs<CreatePayeeInput>(args);

    try {
      // Validate payee name
      if (!input.name.trim()) {
        throw new Error('Payee name cannot be empty or only whitespace');
      }

      // Create the payee
      const payeeResponse: YnabPayeeResponse = await this.client.createPayee(
        input.budget_id,
        {
          name: input.name.trim(),
        }
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
        server_knowledge: payeeResponse.server_knowledge,
      };

    } catch (error) {
      // Handle specific YNAB API errors
      if (error instanceof Error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          throw new Error(`A payee with the name "${input.name}" already exists. Please use a different name or retrieve the existing payee.`);
        }
      }
      
      this.handleError(error, 'create payee');
    }
  }
}