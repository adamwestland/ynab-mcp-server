import type { YnabTransaction, YnabCategory } from '../../types/index.js';

/**
 * Interface for spending pattern analysis results
 */
export interface SpendingPattern {
  category_id: string;
  category_name: string;
  analysis_period: {
    start_date: string;
    end_date: string;
    months_analyzed: number;
  };
  spending_stats: {
    total_spent: number;
    average_monthly: number;
    median_monthly: number;
    min_monthly: number;
    max_monthly: number;
    standard_deviation: number;
  };
  frequency: {
    transactions_count: number;
    average_transaction_size: number;
    median_transaction_size: number;
    days_with_spending: number;
    average_days_between_spending: number;
  };
  predictability: {
    score: number; // 0-100, higher = more predictable
    classification: 'highly_predictable' | 'predictable' | 'variable' | 'highly_variable';
    coefficient_of_variation: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    trend_strength: number; // 0-100
  };
  seasonal_patterns?: {
    month: number;
    month_name: string;
    average_spending: number;
    variance_from_overall_average: number;
  }[] | undefined;
  recommendations: string[];
}

/**
 * Interface for transaction aggregation by month
 */
interface MonthlySpending {
  year: number;
  month: number;
  total_spent: number;
  transaction_count: number;
  unique_days: Set<string>;
}

/**
 * Core spending analysis engine
 * 
 * This class provides comprehensive analysis of spending patterns including:
 * - Statistical analysis (mean, median, standard deviation)
 * - Frequency and timing analysis
 * - Predictability scoring based on variance
 * - Seasonal pattern detection
 * - Trend analysis using linear regression
 * - Pattern-based recommendations
 */
export class SpendingAnalyzer {
  
  /**
   * Analyze spending patterns for specified categories
   * 
   * @param transactions Array of transactions to analyze
   * @param categories Array of categories for naming
   * @param categoryIds Optional filter for specific categories
   * @param monthsToAnalyze Number of months to include in analysis (default: 12)
   * @returns Array of spending pattern analyses
   */
  static analyzeSpendingPatterns(
    transactions: YnabTransaction[],
    categories: YnabCategory[],
    categoryIds?: string[],
    monthsToAnalyze: number = 12
  ): SpendingPattern[] {
    // Filter transactions to analysis period
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToAnalyze);
    
    const filteredTransactions = transactions.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= cutoffDate && tx.amount < 0; // Only outflows (spending)
    });

    // Create category lookup map
    const categoryMap = new Map(categories.map(cat => [cat.id, cat.name]));

    // Group transactions by category
    const transactionsByCategory = this.groupTransactionsByCategory(filteredTransactions, categoryIds);

    const patterns: SpendingPattern[] = [];

    for (const [categoryId, categoryTransactions] of transactionsByCategory) {
      if (categoryTransactions.length === 0) continue;

      const pattern = this.analyzeCategory(
        categoryId,
        categoryMap.get(categoryId) ?? 'Unknown Category',
        categoryTransactions,
        monthsToAnalyze,
        cutoffDate
      );

      patterns.push(pattern);
    }

    // Sort by total spending (descending)
    return patterns.sort((a, b) => Math.abs(b.spending_stats.total_spent) - Math.abs(a.spending_stats.total_spent));
  }

  /**
   * Group transactions by category ID
   */
  private static groupTransactionsByCategory(
    transactions: YnabTransaction[],
    categoryIds?: string[]
  ): Map<string, YnabTransaction[]> {
    const grouped = new Map<string, YnabTransaction[]>();

    for (const tx of transactions) {
      if (!tx.category_id) continue;
      if (categoryIds && !categoryIds.includes(tx.category_id)) continue;

      if (!grouped.has(tx.category_id)) {
        grouped.set(tx.category_id, []);
      }
      grouped.get(tx.category_id)!.push(tx);
    }

    return grouped;
  }

  /**
   * Analyze spending patterns for a single category
   */
  private static analyzeCategory(
    categoryId: string,
    categoryName: string,
    transactions: YnabTransaction[],
    monthsAnalyzed: number,
    cutoffDate: Date
  ): SpendingPattern {
    const endDate = new Date();
    const startDate = cutoffDate;

    // Aggregate by month
    const monthlyData = this.aggregateByMonth(transactions);
    
    // Calculate spending statistics
    const spendingStats = this.calculateSpendingStats(monthlyData);
    
    // Calculate frequency statistics
    const frequencyStats = this.calculateFrequencyStats(transactions);
    
    // Calculate predictability score
    const predictability = this.calculatePredictability(monthlyData, spendingStats);
    
    // Detect seasonal patterns
    const seasonalPatterns = this.detectSeasonalPatterns(monthlyData);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(spendingStats, frequencyStats, predictability, seasonalPatterns);

    return {
      category_id: categoryId,
      category_name: categoryName,
      analysis_period: {
        start_date: startDate.toISOString().split('T')[0] ?? '',
        end_date: endDate.toISOString().split('T')[0] ?? '',
        months_analyzed: monthsAnalyzed,
      },
      spending_stats: spendingStats,
      frequency: frequencyStats,
      predictability,
      ...(seasonalPatterns.length > 0 ? { seasonal_patterns: seasonalPatterns } : {}),
      recommendations,
    };
  }

  /**
   * Aggregate transactions by month
   */
  private static aggregateByMonth(transactions: YnabTransaction[]): MonthlySpending[] {
    const monthlyMap = new Map<string, MonthlySpending>();

    for (const tx of transactions) {
      const date = new Date(tx.date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-based month
      const key = `${year}-${month.toString().padStart(2, '0')}`;
      const dayKey = tx.date.split('T')[0]; // Get YYYY-MM-DD

      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, {
          year,
          month,
          total_spent: 0,
          transaction_count: 0,
          unique_days: new Set<string>(),
        });
      }

      const monthData = monthlyMap.get(key)!;
      monthData.total_spent += Math.abs(tx.amount); // Convert to positive
      monthData.transaction_count += 1;
      monthData.unique_days.add(dayKey ?? '');
    }

    return Array.from(monthlyMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }

  /**
   * Calculate spending statistics
   */
  private static calculateSpendingStats(monthlyData: MonthlySpending[]) {
    const amounts = monthlyData.map(m => m.total_spent);
    const total = amounts.reduce((sum, amt) => sum + amt, 0);

    const mean = amounts.length === 0 ? 0 : total / amounts.length;
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    const median = amounts.length === 0 ? 0 : (sortedAmounts.length % 2 === 0
      ? ((sortedAmounts[sortedAmounts.length / 2 - 1] ?? 0) + (sortedAmounts[sortedAmounts.length / 2] ?? 0)) / 2
      : (sortedAmounts[Math.floor(sortedAmounts.length / 2)] ?? 0));

    const variance = amounts.length === 0 ? 0 : amounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) / amounts.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      total_spent: -total, // Negative for spending
      average_monthly: mean,
      median_monthly: median,
      min_monthly: amounts.length === 0 ? 0 : Math.min(...amounts),
      max_monthly: amounts.length === 0 ? 0 : Math.max(...amounts),
      standard_deviation: standardDeviation,
    };
  }

  /**
   * Calculate frequency statistics
   */
  private static calculateFrequencyStats(transactions: YnabTransaction[]) {
    const amounts = transactions.map(tx => Math.abs(tx.amount));
    const totalAmount = amounts.reduce((sum, amt) => sum + amt, 0);
    const sortedAmounts = [...amounts].sort((a, b) => a - b);

    const uniqueDays = new Set(transactions.map(tx => tx.date.split('T')[0]));
    const dates = transactions.map(tx => new Date(tx.date)).sort((a, b) => a.getTime() - b.getTime());
    
    let totalDaysBetween = 0;
    for (let i = 1; i < dates.length; i++) {
      const diffTime = (dates[i]?.getTime() ?? 0) - (dates[i - 1]?.getTime() ?? 0);
      totalDaysBetween += diffTime / (1000 * 60 * 60 * 24);
    }

    const averageDaysBetween = dates.length > 1 ? totalDaysBetween / (dates.length - 1) : 0;

    const median = amounts.length === 0 ? 0 : (sortedAmounts.length % 2 === 0
      ? ((sortedAmounts[sortedAmounts.length / 2 - 1] ?? 0) + (sortedAmounts[sortedAmounts.length / 2] ?? 0)) / 2
      : (sortedAmounts[Math.floor(sortedAmounts.length / 2)] ?? 0));

    return {
      transactions_count: transactions.length,
      average_transaction_size: transactions.length === 0 ? 0 : totalAmount / transactions.length,
      median_transaction_size: median,
      days_with_spending: uniqueDays.size,
      average_days_between_spending: Math.round(averageDaysBetween * 10) / 10,
    };
  }

  /**
   * Calculate predictability score based on coefficient of variation and trend analysis
   */
  private static calculatePredictability(monthlyData: MonthlySpending[], spendingStats: any) {
    if (monthlyData.length < 3) {
      return {
        score: 0,
        classification: 'highly_variable' as const,
        coefficient_of_variation: 0,
        trend: 'stable' as const,
        trend_strength: 0,
      };
    }

    // Calculate coefficient of variation (CV)
    const cv = spendingStats.average_monthly > 0 ? spendingStats.standard_deviation / spendingStats.average_monthly : 0;

    // Score based on CV (lower CV = higher predictability)
    let score: number;
    if (cv <= 0.15) score = 90;  // Very predictable
    else if (cv <= 0.30) score = 75;  // Predictable
    else if (cv <= 0.50) score = 50;  // Moderately predictable
    else if (cv <= 0.75) score = 25;  // Variable
    else score = 10;  // Highly variable

    // Classification
    let classification: 'highly_predictable' | 'predictable' | 'variable' | 'highly_variable';
    if (score >= 75) classification = 'highly_predictable';
    else if (score >= 50) classification = 'predictable';
    else if (score >= 25) classification = 'variable';
    else classification = 'highly_variable';

    // Trend analysis using simple linear regression
    const n = monthlyData.length;
    const xValues = monthlyData.map((_, i) => i + 1); // 1, 2, 3, ...
    const yValues = monthlyData.map(m => m.total_spent);

    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * (yValues[i] ?? 0), 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgY = sumY / n;

    // Trend classification
    const slopePercentage = Math.abs(slope) / avgY * 100;
    let trend: 'increasing' | 'decreasing' | 'stable';
    let trendStrength = Math.min(slopePercentage, 100);

    if (Math.abs(slope) < avgY * 0.02) { // Less than 2% change per month
      trend = 'stable';
      trendStrength = 0;
    } else if (slope > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return {
      score: Math.round(score),
      classification,
      coefficient_of_variation: Math.round(cv * 1000) / 1000,
      trend,
      trend_strength: Math.round(trendStrength),
    };
  }

  /**
   * Detect seasonal spending patterns
   */
  private static detectSeasonalPatterns(monthlyData: MonthlySpending[]) {
    if (monthlyData.length < 6) return []; // Need at least 6 months for seasonal analysis

    // Group by month number (1-12)
    const monthGroups = new Map<number, number[]>();
    
    for (const data of monthlyData) {
      if (!monthGroups.has(data.month)) {
        monthGroups.set(data.month, []);
      }
      monthGroups.get(data.month)!.push(data.total_spent);
    }

    const overallAverage = monthlyData.reduce((sum, m) => sum + m.total_spent, 0) / monthlyData.length;
    const patterns = [];

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    for (const [month, amounts] of monthGroups) {
      if (amounts.length < 2) continue; // Need at least 2 data points

      const monthAverage = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
      const variance = Math.abs(monthAverage - overallAverage) / overallAverage;

      // Only include if variance is significant (>20%)
      if (variance > 0.20) {
        patterns.push({
          month,
          month_name: monthNames[month - 1] || `Month ${month}`,
          average_spending: Math.round(monthAverage),
          variance_from_overall_average: Math.round(variance * 100),
        });
      }
    }

    return patterns.sort((a, b) => b.variance_from_overall_average - a.variance_from_overall_average);
  }

  /**
   * Generate intelligent recommendations based on analysis
   */
  private static generateRecommendations(
    spendingStats: any,
    frequencyStats: any,
    predictability: any,
    seasonalPatterns: any[]
  ): string[] {
    const recommendations: string[] = [];

    // Predictability-based recommendations
    if (predictability.classification === 'highly_predictable' || predictability.classification === 'predictable') {
      recommendations.push(
        `This category has ${predictability.classification.replace('_', ' ')} spending (${predictability.score}/100). Consider setting up scheduled transactions to automate budgeting.`
      );
    } else {
      recommendations.push(
        `This category has ${predictability.classification.replace('_', ' ')} spending (${predictability.score}/100). Consider budgeting based on the maximum monthly amount ($${(spendingStats.max_monthly / 1000).toFixed(2)}) for safety.`
      );
    }

    // Trend-based recommendations
    if (predictability.trend === 'increasing' && predictability.trend_strength > 20) {
      recommendations.push(
        `Spending is trending upward by ${predictability.trend_strength}%. Review if this increase aligns with your priorities and adjust future budgets accordingly.`
      );
    } else if (predictability.trend === 'decreasing' && predictability.trend_strength > 20) {
      recommendations.push(
        `Great job! Spending is trending downward by ${predictability.trend_strength}%. Consider redirecting savings to other goals.`
      );
    }

    // Seasonal pattern recommendations
    if (seasonalPatterns.length > 0) {
      const highestSeason = seasonalPatterns[0];
      recommendations.push(
        `${highestSeason.month_name} typically has ${highestSeason.variance_from_overall_average}% higher spending than average. Plan ahead by saving extra in the months before.`
      );
    }

    // Frequency-based recommendations
    if (frequencyStats.average_days_between_spending > 30) {
      recommendations.push(
        `This is an infrequent expense (every ${Math.round(frequencyStats.average_days_between_spending)} days on average). Consider using a sinking fund approach.`
      );
    } else if (frequencyStats.average_days_between_spending < 3) {
      recommendations.push(
        `This is a very frequent expense (every ${frequencyStats.average_days_between_spending} days). Look for opportunities to optimize or reduce frequency.`
      );
    }

    // Large variance recommendations
    if (spendingStats.standard_deviation > spendingStats.average_monthly * 0.5) {
      recommendations.push(
        `Spending varies significantly month to month. Budget for the average ($${(spendingStats.average_monthly / 1000).toFixed(2)}) but keep extra funds available for high-spending months.`
      );
    }

    return recommendations;
  }
}