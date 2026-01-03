import type { YnabCategory, YnabTransaction } from '../../types/index.js';
import { SpendingAnalyzer, type SpendingPattern } from './SpendingAnalyzer.js';

/**
 * Allocation strategies for distributing available budget
 */
export type AllocationStrategy = 
  | 'proportional'    // Allocate based on historical spending proportions
  | 'goals_first'     // Prioritize categories with defined goals
  | 'essential_first' // Prioritize essential categories, then discretionary
  | 'balanced';       // Balance between predictability and goals

/**
 * Category priority levels for allocation
 */
export type CategoryPriority = 'emergency' | 'essential' | 'important' | 'discretionary';

/**
 * Allocation recommendation for a category
 */
export interface AllocationRecommendation {
  category_id: string;
  category_name: string;
  current_budgeted: number;
  recommended_amount: number;
  allocation_difference: number;
  priority: CategoryPriority;
  reasoning: string[];
  confidence: number; // 0-100
  goal_info?: {
    goal_type: string;
    goal_target: number;
    goal_target_month: string | null;
    monthly_funding_needed: number;
    progress_percentage: number;
  } | undefined;
  spending_pattern?: {
    monthly_average: number;
    predictability_score: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } | undefined;
}

/**
 * Distribution method for to-be-budgeted funds
 */
export type DistributionMethod = 'template' | 'average' | 'goals' | 'custom';

/**
 * Distribution recommendation result
 */
export interface DistributionRecommendation {
  category_id: string;
  category_name: string;
  current_budgeted: number;
  recommended_addition: number;
  new_total_budgeted: number;
  priority: number; // 1-10, 10 being highest priority
  reasoning: string;
}

/**
 * Emergency fund categories (typically rent, utilities, groceries, etc.)
 */
const EMERGENCY_FUND_KEYWORDS = [
  'rent', 'mortgage', 'housing', 'utilities', 'electric', 'gas', 'water', 
  'groceries', 'food', 'medical', 'insurance', 'car payment', 'phone'
];

/**
 * Essential spending categories
 */
const ESSENTIAL_KEYWORDS = [
  'transportation', 'gas', 'fuel', 'childcare', 'school', 'minimum payment', 
  'debt', 'subscription', 'internet'
];

/**
 * Core allocation engine for budget distribution
 *
 * This class provides allocation logic including:
 * - Multiple allocation strategies based on different priorities
 * - Goal-based allocation with progress tracking
 * - Predictability-aware budgeting
 * - Emergency fund prioritization
 * - Historical spending pattern analysis
 * - Confidence scoring for recommendations
 */
export class AllocationEngine {

  /**
   * Generate category allocation recommendations based on strategy and available funds
   * 
   * @param categories Array of budget categories
   * @param transactions Historical transactions for analysis
   * @param availableFunds Amount available to allocate (in milliunits)
   * @param strategy Allocation strategy to use
   * @param emergencyFundTarget Target emergency fund amount (optional)
   * @returns Array of allocation recommendations
   */
  static recommendCategoryAllocations(
    categories: YnabCategory[],
    transactions: YnabTransaction[],
    _availableFunds: number,
    strategy: AllocationStrategy = 'balanced',
    emergencyFundTarget?: number
  ): AllocationRecommendation[] {
    
    // Analyze spending patterns for all categories
    const spendingPatterns = SpendingAnalyzer.analyzeSpendingPatterns(
      transactions, 
      categories
    );
    
    // Create spending pattern lookup
    const spendingPatternMap = new Map(
      spendingPatterns.map(p => [p.category_id, p])
    );

    const recommendations: AllocationRecommendation[] = [];

    for (const category of categories) {
      if (category.hidden || category.deleted) continue;

      const spendingPattern = spendingPatternMap.get(category.id);
      const priority = this.determinePriority(category, spendingPattern);
      
      const recommendation = this.generateCategoryRecommendation(
        category,
        spendingPattern,
        priority,
        strategy,
        emergencyFundTarget
      );

      recommendations.push(recommendation);
    }

    // Sort by priority and confidence
    return recommendations.sort((a, b) => {
      const priorityOrder = { emergency: 4, essential: 3, important: 2, discretionary: 1 };
      const aPriorityValue = priorityOrder[a.priority];
      const bPriorityValue = priorityOrder[b.priority];
      
      if (aPriorityValue !== bPriorityValue) {
        return bPriorityValue - aPriorityValue;
      }
      return b.confidence - a.confidence;
    });
  }

  /**
   * Distribute to-be-budgeted funds across categories
   * 
   * @param categories Array of budget categories
   * @param toBeBudgeted Amount available to distribute
   * @param method Distribution method
   * @param spendingPatterns Pre-calculated spending patterns (optional)
   * @param emergencyFundTarget Target emergency fund (optional)
   * @returns Array of distribution recommendations
   */
  static distributeAvailableFunds(
    categories: YnabCategory[],
    toBeBudgeted: number,
    method: DistributionMethod = 'template',
    spendingPatterns?: SpendingPattern[],
    emergencyFundTarget?: number
  ): DistributionRecommendation[] {
    
    if (toBeBudgeted <= 0) {
      return [];
    }

    const eligibleCategories = categories.filter(cat => 
      !cat.hidden && !cat.deleted && cat.balance < 0 // Categories that need funding
    );

    let distributions: DistributionRecommendation[] = [];

    switch (method) {
      case 'template':
        distributions = this.distributeByTemplate(eligibleCategories, toBeBudgeted);
        break;
      case 'average':
        distributions = this.distributeByAverage(eligibleCategories, toBeBudgeted, spendingPatterns);
        break;
      case 'goals':
        distributions = this.distributeByGoals(eligibleCategories, toBeBudgeted);
        break;
      case 'custom':
        distributions = this.distributeByCustomLogic(eligibleCategories, toBeBudgeted, spendingPatterns, emergencyFundTarget);
        break;
    }

    return distributions.filter(d => d.recommended_addition > 0);
  }

  /**
   * Determine category priority based on name patterns and spending data
   */
  private static determinePriority(
    category: YnabCategory, 
    spendingPattern?: SpendingPattern
  ): CategoryPriority {
    const name = category.name.toLowerCase();
    
    // Emergency fund categories
    if (EMERGENCY_FUND_KEYWORDS.some(keyword => name.includes(keyword))) {
      return 'emergency';
    }
    
    // Essential categories
    if (ESSENTIAL_KEYWORDS.some(keyword => name.includes(keyword))) {
      return 'essential';
    }
    
    // Categories with defined goals are important
    if (category.goal_type && category.goal_target) {
      return 'important';
    }
    
    // High-frequency, predictable spending is important
    if (spendingPattern && 
        spendingPattern.predictability.score > 70 && 
        spendingPattern.frequency.average_days_between_spending < 30) {
      return 'important';
    }
    
    return 'discretionary';
  }

  /**
   * Generate allocation recommendation for a single category
   */
  private static generateCategoryRecommendation(
    category: YnabCategory,
    spendingPattern: SpendingPattern | undefined,
    priority: CategoryPriority,
    strategy: AllocationStrategy,
    emergencyFundTarget?: number
  ): AllocationRecommendation {
    
    const reasoning: string[] = [];
    let recommendedAmount = category.budgeted;
    let confidence = 50;

    // Goal-based calculation
    if (category.goal_type && category.goal_target) {
      const goalInfo = this.calculateGoalFunding(category);
      
      switch (strategy) {
        case 'goals_first':
          recommendedAmount = Math.max(recommendedAmount, goalInfo.monthly_funding_needed);
          confidence = 90;
          reasoning.push(`Goal-based funding: $${(goalInfo.monthly_funding_needed / 1000).toFixed(2)} monthly to reach target`);
          break;
        case 'balanced':
          const goalWeight = 0.6;
          const avgWeight = 0.4;
          const avgAmount = spendingPattern?.spending_stats.average_monthly || 0;
          recommendedAmount = Math.max(recommendedAmount, goalWeight * goalInfo.monthly_funding_needed + avgWeight * avgAmount);
          confidence = 80;
          reasoning.push(`Balanced approach: 60% goal funding + 40% spending average`);
          break;
      }
    }

    // Spending pattern-based calculation
    if (spendingPattern) {
      const patternAmount = Math.abs(spendingPattern.spending_stats.average_monthly);
      
      switch (strategy) {
        case 'proportional':
          recommendedAmount = Math.max(recommendedAmount, patternAmount);
          confidence = Math.min(confidence + spendingPattern.predictability.score / 2, 95);
          reasoning.push(`Based on ${spendingPattern.analysis_period.months_analyzed}-month spending average`);
          break;
        case 'essential_first':
          if (priority === 'emergency' || priority === 'essential') {
            recommendedAmount = Math.max(recommendedAmount, patternAmount * 1.1); // 10% buffer
            confidence = 85;
            reasoning.push(`Essential category: spending average + 10% buffer`);
          }
          break;
      }

      // Trend adjustments
      if (spendingPattern.predictability.trend === 'increasing') {
        const trendMultiplier = 1 + (spendingPattern.predictability.trend_strength / 100);
        recommendedAmount = recommendedAmount * trendMultiplier;
        reasoning.push(`Adjusted for increasing trend (+${spendingPattern.predictability.trend_strength}%)`);
      }
    }

    // Emergency fund considerations
    if (priority === 'emergency' && emergencyFundTarget) {
      const emergencyAmount = emergencyFundTarget / 12; // Spread over year
      recommendedAmount = Math.max(recommendedAmount, emergencyAmount);
      reasoning.push(`Emergency fund priority: ${(emergencyAmount / 1000).toFixed(2)} monthly contribution`);
      confidence = Math.max(confidence, 85);
    }

    // Under-budgeted warning
    if (category.balance < -category.budgeted * 0.5) { // More than 50% overspent
      reasoning.push(`⚠️  Category is significantly overspent (${((category.balance / category.budgeted) * 100).toFixed(0)}%)`);
      confidence = Math.max(confidence, 80);
    }

    return {
      category_id: category.id,
      category_name: category.name,
      current_budgeted: category.budgeted,
      recommended_amount: Math.round(recommendedAmount),
      allocation_difference: Math.round(recommendedAmount - category.budgeted),
      priority,
      reasoning,
      confidence: Math.min(confidence, 100),
      ...(category.goal_type && category.goal_target ? 
        { goal_info: this.calculateGoalFunding(category) } : 
        {}),
      ...(spendingPattern ? 
        { 
          spending_pattern: {
            monthly_average: Math.abs(spendingPattern.spending_stats.average_monthly),
            predictability_score: spendingPattern.predictability.score,
            trend: spendingPattern.predictability.trend,
          }
        } : 
        {}),
    };
  }

  /**
   * Calculate goal funding requirements
   */
  private static calculateGoalFunding(category: YnabCategory) {
    if (!category.goal_target || !category.goal_type) {
      throw new Error('Category does not have a goal defined');
    }

    const target = category.goal_target;
    const currentAmount = Math.max(0, category.balance); // Available balance
    const remaining = target - currentAmount;

    let monthlyFunding = 0;
    let progressPercentage = (currentAmount / target) * 100;

    if (category.goal_target_month) {
      const targetDate = new Date(category.goal_target_month + '-01');
      const currentDate = new Date();
      const monthsRemaining = Math.max(1, 
        (targetDate.getFullYear() - currentDate.getFullYear()) * 12 + 
        (targetDate.getMonth() - currentDate.getMonth())
      );
      monthlyFunding = Math.max(0, remaining / monthsRemaining);
    } else {
      // Default to 12 months if no target date
      monthlyFunding = Math.max(0, remaining / 12);
    }

    return {
      goal_type: category.goal_type,
      goal_target: target,
      goal_target_month: category.goal_target_month,
      monthly_funding_needed: Math.round(monthlyFunding),
      progress_percentage: Math.round(progressPercentage * 10) / 10,
    };
  }

  /**
   * Distribute funds based on proportional template
   */
  private static distributeByTemplate(
    categories: YnabCategory[],
    availableFunds: number
  ): DistributionRecommendation[] {
    // Use current budgeted amounts as template proportions
    const totalBudgeted = categories.reduce((sum, cat) => sum + Math.abs(cat.budgeted), 0);
    
    if (totalBudgeted === 0) {
      return this.distributeEqually(categories, availableFunds);
    }

    return categories.map(cat => {
      const proportion = Math.abs(cat.budgeted) / totalBudgeted;
      const addition = Math.round(availableFunds * proportion);
      
      return {
        category_id: cat.id,
        category_name: cat.name,
        current_budgeted: cat.budgeted,
        recommended_addition: addition,
        new_total_budgeted: cat.budgeted + addition,
        priority: 5,
        reasoning: `Proportional to current budget template (${(proportion * 100).toFixed(1)}%)`,
      };
    });
  }

  /**
   * Distribute funds based on spending averages
   */
  private static distributeByAverage(
    categories: YnabCategory[],
    availableFunds: number,
    spendingPatterns?: SpendingPattern[]
  ): DistributionRecommendation[] {
    if (!spendingPatterns || spendingPatterns.length === 0) {
      return this.distributeEqually(categories, availableFunds);
    }

    const patternMap = new Map(spendingPatterns.map(p => [p.category_id, p]));
    const totalNeeded = categories.reduce((sum, cat) => {
      const pattern = patternMap.get(cat.id);
      const needed = Math.max(0, (pattern?.spending_stats.average_monthly || 0) - cat.budgeted);
      return sum + needed;
    }, 0);

    if (totalNeeded === 0) {
      return this.distributeEqually(categories, availableFunds);
    }

    return categories.map(cat => {
      const pattern = patternMap.get(cat.id);
      const averageSpending = Math.abs(pattern?.spending_stats.average_monthly || 0);
      const needed = Math.max(0, averageSpending - cat.budgeted);
      const proportion = needed / totalNeeded;
      const addition = Math.round(availableFunds * proportion);

      return {
        category_id: cat.id,
        category_name: cat.name,
        current_budgeted: cat.budgeted,
        recommended_addition: addition,
        new_total_budgeted: cat.budgeted + addition,
        priority: pattern?.predictability.score || 50,
        reasoning: `Based on spending average: $${(averageSpending / 1000).toFixed(2)}/month`,
      };
    });
  }

  /**
   * Distribute funds prioritizing goals
   */
  private static distributeByGoals(
    categories: YnabCategory[],
    availableFunds: number
  ): DistributionRecommendation[] {
    const goalCategories = categories.filter(cat => cat.goal_type && cat.goal_target);
    const nonGoalCategories = categories.filter(cat => !cat.goal_type || !cat.goal_target);

    let remaining = availableFunds;
    const distributions: DistributionRecommendation[] = [];

    // First, fund goal categories
    for (const cat of goalCategories) {
      const goalInfo = this.calculateGoalFunding(cat);
      const needed = goalInfo.monthly_funding_needed;
      const allocation = Math.min(remaining, needed);
      
      if (allocation > 0) {
        distributions.push({
          category_id: cat.id,
          category_name: cat.name,
          current_budgeted: cat.budgeted,
          recommended_addition: allocation,
          new_total_budgeted: cat.budgeted + allocation,
          priority: 10,
          reasoning: `Goal funding: ${goalInfo.progress_percentage.toFixed(1)}% complete`,
        });
        
        remaining -= allocation;
      }
    }

    // Distribute remaining funds to non-goal categories
    if (remaining > 0 && nonGoalCategories.length > 0) {
      const equalShare = Math.round(remaining / nonGoalCategories.length);
      
      for (const cat of nonGoalCategories) {
        distributions.push({
          category_id: cat.id,
          category_name: cat.name,
          current_budgeted: cat.budgeted,
          recommended_addition: equalShare,
          new_total_budgeted: cat.budgeted + equalShare,
          priority: 3,
          reasoning: `Equal distribution of remaining funds after goal funding`,
        });
      }
    }

    return distributions;
  }

  /**
   * Custom distribution logic combining multiple factors
   */
  private static distributeByCustomLogic(
    categories: YnabCategory[],
    availableFunds: number,
    _spendingPatterns?: SpendingPattern[],
    emergencyFundTarget?: number
  ): DistributionRecommendation[] {
    const distributions: DistributionRecommendation[] = [];
    let remaining = availableFunds;

    // Phase 1: Emergency categories get priority
    const emergencyCategories = categories.filter(cat => 
      this.determinePriority(cat) === 'emergency'
    );
    
    for (const cat of emergencyCategories) {
      const emergencyAmount = emergencyFundTarget ? emergencyFundTarget / 12 : cat.budgeted * 0.2;
      const allocation = Math.min(remaining, emergencyAmount);
      
      if (allocation > 0) {
        distributions.push({
          category_id: cat.id,
          category_name: cat.name,
          current_budgeted: cat.budgeted,
          recommended_addition: allocation,
          new_total_budgeted: cat.budgeted + allocation,
          priority: 10,
          reasoning: 'Emergency fund priority',
        });
        
        remaining -= allocation;
      }
    }

    // Phase 2: Goal categories
    const goalCategories = categories.filter(cat => 
      cat.goal_type && cat.goal_target && !emergencyCategories.includes(cat)
    );
    
    for (const cat of goalCategories) {
      const goalInfo = this.calculateGoalFunding(cat);
      const allocation = Math.min(remaining, goalInfo.monthly_funding_needed);
      
      if (allocation > 0) {
        distributions.push({
          category_id: cat.id,
          category_name: cat.name,
          current_budgeted: cat.budgeted,
          recommended_addition: allocation,
          new_total_budgeted: cat.budgeted + allocation,
          priority: 8,
          reasoning: `Goal progress: ${goalInfo.progress_percentage.toFixed(1)}%`,
        });
        
        remaining -= allocation;
      }
    }

    // Phase 3: Distribute remaining based on need and patterns
    const remainingCategories = categories.filter(cat => 
      !emergencyCategories.includes(cat) && !goalCategories.includes(cat)
    );
    
    if (remaining > 0 && remainingCategories.length > 0) {
      const equalShare = Math.round(remaining / remainingCategories.length);
      
      for (const cat of remainingCategories) {
        distributions.push({
          category_id: cat.id,
          category_name: cat.name,
          current_budgeted: cat.budgeted,
          recommended_addition: equalShare,
          new_total_budgeted: cat.budgeted + equalShare,
          priority: 5,
          reasoning: 'Balanced distribution of remaining funds',
        });
      }
    }

    return distributions;
  }

  /**
   * Distribute funds equally among categories
   */
  private static distributeEqually(
    categories: YnabCategory[],
    availableFunds: number
  ): DistributionRecommendation[] {
    if (categories.length === 0) return [];
    
    const equalShare = Math.round(availableFunds / categories.length);
    
    return categories.map(cat => ({
      category_id: cat.id,
      category_name: cat.name,
      current_budgeted: cat.budgeted,
      recommended_addition: equalShare,
      new_total_budgeted: cat.budgeted + equalShare,
      priority: 5,
      reasoning: 'Equal distribution',
    }));
  }
}