/**
 * @fileoverview Real-time health monitoring dashboard
 * @module HealthDashboard
 */

import * as pc from 'picocolors';
import { EventEmitter } from 'events';
import { HealthReport, HealthMonitor } from './health-monitor';

/**
 * Dashboard configuration
 */
export interface DashboardConfig {
  refreshRate?: number; // milliseconds
  maxHistoryPoints?: number;
  showCategories?: boolean;
  showTrends?: boolean;
  showLiveUpdates?: boolean;
  showMetrics?: boolean;
  compactMode?: boolean;
  theme?: 'dark' | 'light' | 'auto';
  notifications?: boolean;
  autoScroll?: boolean;
}

/**
 * Dashboard state
 */
interface DashboardState {
  currentReport?: HealthReport;
  history: HealthReport[];
  isRunning: boolean;
  lastUpdate: number;
  alerts: DashboardAlert[];
}

/**
 * Dashboard alert
 */
interface DashboardAlert {
  id: string;
  type: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  read: boolean;
}

/**
 * Real-time health monitoring dashboard
 */
export class HealthDashboard extends EventEmitter {
  private readonly config: Required<DashboardConfig>;
  private readonly state: DashboardState;
  private refreshTimer?: NodeJS.Timeout;
  private readonly healthMonitor: HealthMonitor;

  constructor(healthMonitor: HealthMonitor, config: DashboardConfig = {}) {
    super();

    this.healthMonitor = healthMonitor;
    this.config = {
      refreshRate: config.refreshRate ?? 5000, // 5 seconds
      maxHistoryPoints: config.maxHistoryPoints ?? 100,
      showCategories: config.showCategories ?? true,
      showTrends: config.showTrends ?? true,
      showLiveUpdates: config.showLiveUpdates ?? true,
      showMetrics: config.showMetrics ?? true,
      compactMode: config.compactMode ?? false,
      theme: config.theme ?? 'auto',
      notifications: config.notifications ?? true,
      autoScroll: config.autoScroll ?? true
    };

    this.state = {
      history: [],
      isRunning: false,
      lastUpdate: 0,
      alerts: []
    };

    this.setupEventListeners();
  }

  /**
   * Start the dashboard
   */
  async start(projectPath: string = process.cwd()): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Dashboard is already running');
    }

    this.state.isRunning = true;
    this.emit('start');

    // Initial render
    await this.updateDashboard(projectPath);

    // Start refresh timer
    this.refreshTimer = setInterval(() => {
      this.updateDashboard(projectPath).catch(error => {
        this.addAlert('critical', `Dashboard update failed: ${error.message}`);
      });
    }, this.config.refreshRate);

    // Handle terminal resize
    if (typeof process !== 'undefined' && process.stdout) {
      process.stdout.on('resize', () => {
        this.render();
      });
    }

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      this.stop();
      process.exit(0);
    });
  }

  /**
   * Stop the dashboard
   */
  stop(): void {
    if (!this.state.isRunning) return;

    this.state.isRunning = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      delete (this as any).refreshTimer;
    }

    this.emit('stop');
  }

  /**
   * Update dashboard data
   */
  private async updateDashboard(projectPath: string): Promise<void> {
    try {
      const report = await this.healthMonitor.getHealthStatus(projectPath);

      // Update state
      this.state.currentReport = report;
      this.state.lastUpdate = Date.now();

      // Add to history
      this.state.history.push(report);
      if (this.state.history.length > this.config.maxHistoryPoints) {
        this.state.history.shift();
      }

      // Check for alerts
      this.checkForAlerts(report);

      // Render dashboard
      this.render();

      this.emit('update', report);

    } catch (error) {
      this.addAlert('critical', `Failed to update dashboard: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Render the dashboard
   */
  private render(): void {
    if (!this.state.currentReport) return;

    // Clear screen and move cursor to top
    if (this.config.autoScroll) {
      process.stdout.write('\x1b[2J\x1b[H');
    }

    const report = this.state.currentReport;

    // Header
    this.renderHeader();

    // Main stats
    this.renderMainStats(report);

    // Category breakdown
    if (this.config.showCategories) {
      this.renderCategoryBreakdown(report);
    }

    // Trend chart
    if (this.config.showTrends && this.state.history.length > 1) {
      this.renderTrendChart();
    }

    // Live issues
    this.renderLiveIssues(report);

    // Performance metrics
    if (this.config.showMetrics) {
      this.renderMetrics(report);
    }

    // Alerts
    if (this.state.alerts.length > 0) {
      this.renderAlerts();
    }

    // Footer
    this.renderFooter();
  }

  private renderHeader(): void {
    const width = process.stdout.columns || 80;
    const title = '🏥 Schema Health Dashboard';
    const timestamp = new Date().toLocaleTimeString();

    console.log(pc.bold(pc.blue('═'.repeat(width))));
    console.log(pc.bold(`${title}${' '.repeat(width - title.length - timestamp.length)}${timestamp}`));
    console.log(pc.bold(pc.blue('═'.repeat(width))));
  }

  private renderMainStats(report: HealthReport): void {
    const score = report.score.overall;
    const scoreColor = score >= 80 ? pc.green : score >= 60 ? pc.yellow : pc.red;
    const trendIcon = this.getTrendIcon(report.score.trend);

    console.log('');
    console.log(pc.bold('📊 Overall Health'));
    console.log(`   Score: ${scoreColor(score.toString())}/100 ${trendIcon} ${report.score.trend}`);
    console.log(`   Schemas: ${pc.cyan(report.summary.totalSchemas.toString())} total, ${pc.green(report.summary.healthySchemas.toString())} healthy`);
    console.log(`   Issues: ${this.formatIssueCount(report.summary.totalIssues)} total (${pc.red(report.summary.criticalIssues.toString())} critical, ${pc.yellow(report.summary.warningIssues.toString())} warnings)`);

    if (report.summary.autoFixableIssues > 0) {
      console.log(`   Auto-fixable: ${pc.cyan(report.summary.autoFixableIssues.toString())} issues`);
    }
  }

  private renderCategoryBreakdown(report: HealthReport): void {
    console.log('');
    console.log(pc.bold('📋 Category Health'));

    const categories = Object.entries(report.score.categories)
      .sort(([,a], [,b]) => b.score - a.score);

    if (this.config.compactMode) {
      // Compact single-line display
      const categoryBars = categories.map(([category, data]) => {
        const score = data.score;
        const color = score >= 80 ? pc.green : score >= 60 ? pc.yellow : pc.red;
        return `${this.formatCategoryName(category)}: ${color(this.generateMiniBar(score))}`;
      }).join('  ');
      console.log(`   ${categoryBars}`);
    } else {
      // Full category breakdown
      for (const [category, data] of categories) {
        const score = data.score;
        const issues = data.issues;
        const color = score >= 80 ? pc.green : score >= 60 ? pc.yellow : pc.red;
        const bar = this.generateProgressBar(score, 20);

        console.log(`   ${this.formatCategoryName(category).padEnd(15)} ${color(bar)} ${color(score.toString().padStart(3))}/100 ${issues > 0 ? pc.gray(`(${issues} issues)`) : ''}`);
      }
    }
  }

  private renderTrendChart(): void {
    console.log('');
    console.log(pc.bold('📈 Health Trend (Last 30 points)'));

    const scores = this.state.history.slice(-30).map(r => r.score.overall);
    const sparkline = this.generateSparkline(scores);

    console.log(`   ${sparkline}`);

    if (scores.length >= 2) {
      const latest = scores[scores.length - 1];
      const previous = scores[scores.length - 2];
      const change = (latest || 0) - (previous || 0);
      const changeStr = change > 0 ? pc.green(`+${change}`) : change < 0 ? pc.red(change.toString()) : pc.gray('0');

      console.log(`   Last change: ${changeStr} points`);
    }
  }

  private renderLiveIssues(report: HealthReport): void {
    const criticalIssues = report.checks.filter(c => c.severity === 'critical').slice(0, 5);
    const warningIssues = report.checks.filter(c => c.severity === 'warning').slice(0, 3);

    if (criticalIssues.length > 0 || warningIssues.length > 0) {
      console.log('');
      console.log(pc.bold('🚨 Active Issues'));

      [...criticalIssues, ...warningIssues].forEach(issue => {
        const icon = issue.severity === 'critical' ? '🔴' : '🟡';
        const category = pc.gray(`[${issue.category}]`);
        const file = issue.file ? pc.gray(` - ${this.truncateFilePath(issue.file)}`) : '';

        console.log(`   ${icon} ${category} ${issue.message}${file}`);
      });

      if (report.summary.totalIssues > 8) {
        console.log(`   ${pc.gray(`... and ${report.summary.totalIssues - 8} more issues`)}`);
      }
    }
  }

  private renderMetrics(report: HealthReport): void {
    console.log('');
    console.log(pc.bold('⚡ Performance Metrics'));

    const metrics = report.metrics;
    console.log(`   Checks/sec: ${metrics.checksPerSecond.toFixed(1)}   Memory: ${this.formatBytes(metrics.memoryUsage)}   Cache: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  }

  private renderAlerts(): void {
    const unreadAlerts = this.state.alerts.filter(a => !a.read).slice(0, 3);
    if (unreadAlerts.length === 0) return;

    console.log('');
    console.log(pc.bold('🔔 Alerts'));

    unreadAlerts.forEach(alert => {
      const icon = alert.type === 'critical' ? '🚨' : alert.type === 'warning' ? '⚠️' : 'ℹ️';
      const time = new Date(alert.timestamp).toLocaleTimeString();
      console.log(`   ${icon} ${pc.gray(time)} ${alert.message}`);
    });
  }

  private renderFooter(): void {
    console.log('');
    console.log(pc.gray('─'.repeat(process.stdout.columns || 80)));
    console.log(pc.gray(`Last updated: ${new Date(this.state.lastUpdate).toLocaleTimeString()}   Press Ctrl+C to exit`));
  }

  private setupEventListeners(): void {
    this.healthMonitor.on('checkComplete', (event) => {
      if (this.config.showLiveUpdates) {
        this.addAlert('info', `Health check completed - Score: ${event.report.score.overall}/100`);
      }
    });

    this.healthMonitor.on('notification', (notification) => {
      if (this.config.notifications) {
        this.addAlert(notification.type === 'critical' ? 'critical' : 'warning', notification.message);
      }
    });
  }

  private checkForAlerts(report: HealthReport): void {
    // Check for critical score drop
    if (this.state.history.length > 0) {
      const previousReport = this.state.history[this.state.history.length - 1];
      const scoreDrop = (previousReport?.score.overall || 0) - report.score.overall;

      if (scoreDrop >= 10) {
        this.addAlert('critical', `Health score dropped by ${scoreDrop} points`);
      }
    }

    // Check for new critical issues
    if (report.summary.criticalIssues > 0) {
      const previousCritical = this.state.history.length > 0
        ? this.state.history[this.state.history.length - 1]?.summary.criticalIssues || 0
        : 0;

      if (report.summary.criticalIssues > previousCritical) {
        const newIssues = report.summary.criticalIssues - previousCritical;
        this.addAlert('critical', `${newIssues} new critical issue${newIssues > 1 ? 's' : ''} detected`);
      }
    }
  }

  private addAlert(type: 'info' | 'warning' | 'critical', message: string): void {
    const alert: DashboardAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      timestamp: Date.now(),
      read: false
    };

    this.state.alerts.push(alert);

    // Limit alert history
    if (this.state.alerts.length > 50) {
      this.state.alerts = this.state.alerts.slice(-50);
    }

    this.emit('alert', alert);
  }

  private getTrendIcon(trend: string): string {
    switch (trend) {
      case 'improving': return '📈';
      case 'declining': return '📉';
      default: return '➡️';
    }
  }

  private formatIssueCount(count: number): string {
    if (count === 0) return pc.green('0');
    if (count < 5) return pc.yellow(count.toString());
    return pc.red(count.toString());
  }

  private formatCategoryName(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  private generateProgressBar(value: number, width: number): string {
    const filled = Math.round((value / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private generateMiniBar(value: number): string {
    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const index = Math.min(Math.floor((value / 100) * chars.length), chars.length - 1);
    return chars[index] || '▁';
  }

  private generateSparkline(values: number[]): string {
    if (values.length === 0) return '';

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

    return values.map(value => {
      const normalized = (value - min) / range;
      const index = Math.min(Math.floor(normalized * chars.length), chars.length - 1);
      const color = value >= 80 ? pc.green : value >= 60 ? pc.yellow : pc.red;
      return color(chars[index]);
    }).join('');
  }

  private truncateFilePath(path: string, maxLength: number = 30): string {
    if (path.length <= maxLength) return path;

    const parts = path.split('/');
    if (parts.length === 1) return `...${path.slice(-maxLength + 3)}`;

    const filename = parts[parts.length - 1];
    const remaining = maxLength - (filename?.length || 0) - 3; // 3 for "..."

    if (remaining <= 0) return `...${filename}`;

    let result = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part && result.length + part.length + 1 <= remaining) {
        result += (result ? '/' : '') + part;
      } else {
        result = '...' + result;
        break;
      }
    }

    return `${result}/${filename}`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + (sizes[i] || 'B');
  }

  /**
   * Mark alerts as read
   */
  markAlertsAsRead(alertIds?: string[]): void {
    if (alertIds) {
      for (const alert of this.state.alerts) {
        if (alertIds.includes(alert.id)) {
          alert.read = true;
        }
      }
    } else {
      // Mark all as read
      for (const alert of this.state.alerts) {
        alert.read = true;
      }
    }
  }

  /**
   * Get current dashboard state
   */
  getState(): Readonly<DashboardState> {
    return { ...this.state };
  }

  /**
   * Export dashboard data
   */
  exportData(): {
    config: DashboardConfig;
    state: DashboardState;
    timestamp: number;
  } {
    return {
      config: this.config,
      state: { ...this.state },
      timestamp: Date.now()
    };
  }
}