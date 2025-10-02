import fs from 'fs/promises';
import path from 'path';

/**
 * Timing data for a specific step in the pipeline
 */
export interface StepTimingData {
  stepName: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  error?: string;
  experimentId?: string; // Tracking experiment ID in aggregated view
}

/**
 * Experiment performance data including all step timings
 */
export interface ExperimentPerformanceData {
  experimentId: string;
  totalDuration: number;
  startTime: number;
  endTime: number;
  steps: StepTimingData[];
  experimentLabel?: string; // Optional category label
}

/**
 * Aggregated performance data for multiple experiments
 */
export interface AggregatedPerformanceData {
  runId: string;
  runName?: string;
  experimentCount: number;
  totalDuration: number;
  startTime: number;
  endTime: number;
  experiments: ExperimentPerformanceData[];
  allSteps: StepTimingData[];
  stepStats: Record<string, StepStatistics>;
}

/**
 * Statistics for a particular step across all experiments
 */
export interface StepStatistics {
  stepName: string;
  count: number;
  successCount: number;
  failureCount: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  avgDuration: number;
  medianDuration: number;
}

/**
 * Class for tracking step timing data and generating flame graph visualization
 */
export class FlameGraphGenerator {
  private performanceData: Map<string, ExperimentPerformanceData> = new Map();
  private aggregatedData: Map<string, AggregatedPerformanceData> = new Map();

  /**
   * Start timing for a step in an experiment
   * 
   * @param experimentId Unique identifier for the experiment
   * @param stepName Name of the step being executed
   * @returns The start time in milliseconds
   */
  public startStepTiming(experimentId: string, stepName: string): number {
    const startTime = Date.now();
    
    // Initialize experiment data if it doesn't exist
    if (!this.performanceData.has(experimentId)) {
      this.performanceData.set(experimentId, {
        experimentId,
        totalDuration: 0,
        startTime,
        endTime: 0,
        steps: []
      });
    }
    
    return startTime;
  }

  /**
   * End timing for a step in an experiment
   * 
   * @param experimentId Unique identifier for the experiment
   * @param stepName Name of the step that was executed
   * @param startTime Start time from startStepTiming
   * @param success Whether the step completed successfully
   * @param error Optional error message if step failed
   * @returns Duration of the step in milliseconds
   */
  public endStepTiming(
    experimentId: string, 
    stepName: string, 
    startTime: number, 
    success: boolean, 
    error?: string
  ): number {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const experiment = this.performanceData.get(experimentId);
    if (!experiment) {
      console.warn(`No timing data found for experiment ${experimentId}`);
      return duration;
    }
    
    // Add step timing data
    experiment.steps.push({
      stepName,
      startTime,
      endTime,
      duration,
      success,
      error
    });
    
    // Update experiment end time
    experiment.endTime = Math.max(experiment.endTime, endTime);
    
    // Update total duration
    experiment.totalDuration = experiment.endTime - experiment.startTime;
    
    return duration;
  }

  /**
   * Get all performance data for an experiment
   * 
   * @param experimentId Unique identifier for the experiment
   * @returns Performance data for the experiment or undefined if not found
   */
  public getExperimentPerformance(experimentId: string): ExperimentPerformanceData | undefined {
    return this.performanceData.get(experimentId);
  }

  /**
   * Generate HTML flame graph visualization for an experiment
   * 
   * @param experimentId Unique identifier for the experiment
   * @returns HTML content for the flame graph
   */
  public generateFlameGraphHtml(experimentId: string): string {
    const experiment = this.performanceData.get(experimentId);
    if (!experiment) {
      return `<p>No performance data found for experiment ${experimentId}</p>`;
    }
    
    // Sort steps by start time
    const sortedSteps = [...experiment.steps].sort((a, b) => a.startTime - b.startTime);
    
    // Create the HTML for the flame graph
    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pipeline Flame Graph - Experiment ${experimentId}</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 20px;
          background-color: #f5f5f5;
        }
        h1 {
          margin-bottom: 20px;
        }
        .summary {
          background-color: #fff;
          padding: 15px;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
        .flame-graph {
          position: relative;
          height: 400px;
          background-color: #fff;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          padding: 20px 10px;
          overflow-x: auto;
          white-space: nowrap;
        }
        .timeline {
          position: relative;
          height: 30px;
          margin-top: 20px;
          margin-bottom: 10px;
          border-bottom: 1px solid #ddd;
        }
        .timeline-tick {
          position: absolute;
          top: 30px;
          height: 10px;
          border-left: 1px solid #ddd;
          padding-left: 5px;
          font-size: 12px;
          color: #666;
        }
        .step-bar {
          position: absolute;
          height: 50px;
          border-radius: 4px;
          padding: 10px;
          box-sizing: border-box;
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .step-bar.success {
          background-color: #4caf50;
        }
        .step-bar.failure {
          background-color: #f44336;
        }
        .step-bar:hover {
          opacity: 0.9;
        }
        .tooltip {
          position: absolute;
          background-color: rgba(0,0,0,0.8);
          color: white;
          padding: 10px;
          border-radius: 4px;
          font-size: 14px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          z-index: 10;
          max-width: 300px;
          white-space: normal;
        }
        .step-details {
          margin-top: 20px;
          background-color: #fff;
          padding: 15px;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f2f2f2;
        }
        .duration-cell {
          text-align: right;
        }
        .status-success {
          color: #4caf50;
          font-weight: bold;
        }
        .status-failure {
          color: #f44336;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>Pipeline Flame Graph - Experiment ${experimentId}</h1>
      
      <div class="summary">
        <h2>Performance Summary</h2>
        <p>Total Duration: ${formatDuration(experiment.totalDuration)}</p>
        <p>Started: ${new Date(experiment.startTime).toLocaleString()}</p>
        <p>Ended: ${new Date(experiment.endTime).toLocaleString()}</p>
        <p>Steps: ${experiment.steps.length}</p>
      </div>
      
      <div class="flame-graph">
        <div class="timeline">
          ${generateTimelineTicks(experiment.startTime, experiment.endTime)}
        </div>
        <div id="graph-content">
          ${generateStepBars(experiment)}
        </div>
        <div id="tooltip" class="tooltip"></div>
      </div>
      
      <div class="step-details">
        <h2>Step Details</h2>
        <table>
          <thead>
            <tr>
              <th>Step Name</th>
              <th>Status</th>
              <th>Start Time</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            ${generateStepRows(sortedSteps)}
          </tbody>
        </table>
      </div>
      
      <script>
        // JavaScript for interactivity
        document.querySelectorAll('.step-bar').forEach(bar => {
          bar.addEventListener('mouseover', event => {
            const tooltip = document.getElementById('tooltip');
            tooltip.innerHTML = bar.getAttribute('data-tooltip');
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY + 10) + 'px';
            tooltip.style.opacity = 1;
          });
          
          bar.addEventListener('mouseout', () => {
            document.getElementById('tooltip').style.opacity = 0;
          });
          
          bar.addEventListener('mousemove', event => {
            const tooltip = document.getElementById('tooltip');
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY + 10) + 'px';
          });
        });
      </script>
    </body>
    </html>
    `;
    
    return html;
  }

  /**
   * Save flame graph visualization to a file
   * 
   * @param experimentId Unique identifier for the experiment
   * @param outputDir Directory to save the flame graph in
   * @param label Optional category label for the experiment
   * @returns Promise that resolves to the file path where the flame graph was saved
   */
  public async saveFlameGraph(experimentId: string, outputDir: string, label?: string): Promise<string> {
    const html = this.generateFlameGraphHtml(experimentId);
    
    // Create "flamegraph" directory if it doesn't exist
    const flamegraphDir = path.join(outputDir, 'flamegraph');
    await fs.mkdir(flamegraphDir, { recursive: true });
    
    // Save the flame graph HTML
    const filePath = path.join(flamegraphDir, 'flamegraph.html');
    await fs.writeFile(filePath, html);
    
    // Save the raw performance data as JSON
    const performanceData = this.performanceData.get(experimentId);
    if (performanceData) {
      // Update the label if provided
      if (label) {
        performanceData.experimentLabel = label;
      }
      
      const jsonPath = path.join(flamegraphDir, 'performance_data.json');
      await fs.writeFile(jsonPath, JSON.stringify(performanceData, null, 2));
    }
    
    return filePath;
  }
  
  /**
   * Aggregate performance data from multiple experiments into a run summary
   * 
   * @param runId Unique identifier for the run
   * @param experimentIds Array of experiment IDs to include in the aggregate
   * @param runName Optional name for the run
   * @returns Aggregated performance data for all experiments
   */
  public aggregatePerformanceData(runId: string, experimentIds: string[], runName?: string): AggregatedPerformanceData {
    // Filter to only include experiments that exist in our data
    const validExperimentIds = experimentIds.filter(id => this.performanceData.has(id));
    
    // Get performance data for all valid experiments
    const experiments = validExperimentIds.map(id => this.performanceData.get(id)!);
    
    // Calculate aggregated statistics
    let startTime = Number.MAX_SAFE_INTEGER;
    let endTime = 0;
    let totalDuration = 0;
    
    // Collect all steps from all experiments
    const allSteps: StepTimingData[] = [];
    
    // Group steps by name for statistics
    const stepsByName: Record<string, StepTimingData[]> = {};
    
    // Process each experiment
    experiments.forEach(experiment => {
      // Update run start and end times
      startTime = Math.min(startTime, experiment.startTime);
      endTime = Math.max(endTime, experiment.endTime);
      totalDuration += experiment.totalDuration;
      
      // Process steps from this experiment
      experiment.steps.forEach(step => {
        // Add experiment ID to step for tracking
        const stepWithExperiment: StepTimingData = {
          ...step,
          experimentId: experiment.experimentId
        };
        
        // Add to all steps array
        allSteps.push(stepWithExperiment);
        
        // Add to steps by name
        if (!stepsByName[step.stepName]) {
          stepsByName[step.stepName] = [];
        }
        stepsByName[step.stepName].push(stepWithExperiment);
      });
    });
    
    // Calculate statistics for each step type
    const stepStats: Record<string, StepStatistics> = {};
    
    Object.entries(stepsByName).forEach(([stepName, steps]) => {
      // Calculate basic stats
      const count = steps.length;
      const successCount = steps.filter(step => step.success).length;
      const failureCount = count - successCount;
      
      // Calculate duration stats
      const durations = steps.map(step => step.duration);
      const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);
      const avgDuration = totalDuration / count;
      
      // Calculate median duration
      const sortedDurations = [...durations].sort((a, b) => a - b);
      const midIndex = Math.floor(sortedDurations.length / 2);
      const medianDuration = sortedDurations.length % 2 === 0
        ? (sortedDurations[midIndex - 1] + sortedDurations[midIndex]) / 2
        : sortedDurations[midIndex];
      
      stepStats[stepName] = {
        stepName,
        count,
        successCount,
        failureCount,
        totalDuration,
        minDuration,
        maxDuration,
        avgDuration,
        medianDuration
      };
    });
    
    // Create aggregated data
    const aggregatedData: AggregatedPerformanceData = {
      runId,
      runName,
      experimentCount: experiments.length,
      totalDuration,
      startTime,
      endTime,
      experiments,
      allSteps,
      stepStats
    };
    
    // Store the aggregated data
    this.aggregatedData.set(runId, aggregatedData);
    
    return aggregatedData;
  }
  
  /**
   * Generate HTML flame graph visualization for aggregated performance data
   * 
   * @param runId Unique identifier for the run
   * @returns HTML content for the aggregated flame graph
   */
  public generateAggregatedFlameGraphHtml(runId: string): string {
    const aggregatedData = this.aggregatedData.get(runId);
    if (!aggregatedData) {
      return `<p>No aggregated performance data found for run ${runId}</p>`;
    }
    
    // Create HTML for the aggregated flame graph
    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Aggregated Pipeline Flame Graph - Run ${runId}</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          margin: 20px;
          background-color: #f5f5f5;
        }
        h1, h2, h3 {
          margin-bottom: 15px;
        }
        .summary {
          background-color: #fff;
          padding: 15px;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
        .experiment-summary {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 20px;
        }
        .experiment-card {
          background-color: #fff;
          padding: 15px;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          flex: 1 1 300px;
          max-width: 400px;
        }
        .experiment-card h3 {
          margin-top: 0;
          margin-bottom: 10px;
          font-size: 16px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .experiment-card a {
          display: inline-block;
          margin-top: 10px;
          color: #0066cc;
          text-decoration: none;
        }
        .experiment-card a:hover {
          text-decoration: underline;
        }
        .flame-graph {
          position: relative;
          height: 500px;
          background-color: #fff;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          padding: 20px 10px;
          overflow-x: auto;
          white-space: nowrap;
          margin-bottom: 20px;
        }
        .timeline {
          position: relative;
          height: 30px;
          margin-top: 20px;
          margin-bottom: 10px;
          border-bottom: 1px solid #ddd;
        }
        .timeline-tick {
          position: absolute;
          top: 30px;
          height: 10px;
          border-left: 1px solid #ddd;
          padding-left: 5px;
          font-size: 12px;
          color: #666;
        }
        .step-bar {
          position: absolute;
          height: 25px;
          border-radius: 4px;
          padding: 5px;
          box-sizing: border-box;
          color: white;
          font-size: 12px;
          cursor: pointer;
          transition: opacity 0.2s;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .step-bar.success {
          background-color: #4caf50;
        }
        .step-bar.failure {
          background-color: #f44336;
        }
        .step-bar:hover {
          opacity: 0.9;
        }
        .tooltip {
          position: absolute;
          background-color: rgba(0,0,0,0.8);
          color: white;
          padding: 10px;
          border-radius: 4px;
          font-size: 14px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
          z-index: 10;
          max-width: 300px;
          white-space: normal;
        }
        .step-details {
          background-color: #fff;
          padding: 15px;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f2f2f2;
        }
        .duration-cell {
          text-align: right;
        }
        .category-filter {
          margin-bottom: 15px;
        }
        .filter-btn {
          background-color: #f1f1f1;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          margin-right: 8px;
          margin-bottom: 8px;
          cursor: pointer;
          font-size: 14px;
        }
        .filter-btn.active {
          background-color: #4caf50;
          color: white;
        }
        .chart-container {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          margin-bottom: 20px;
        }
        .chart {
          flex: 1 1 450px;
          min-height: 300px;
          background-color: #fff;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          padding: 15px;
        }
        .chart-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 10px;
          text-align: center;
        }
        .status-success {
          color: #4caf50;
          font-weight: bold;
        }
        .status-failure {
          color: #f44336;
          font-weight: bold;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <h1>Aggregated Pipeline Flame Graph</h1>
      <h2>${aggregatedData.runName || `Run ${runId}`}</h2>
      
      <div class="summary">
        <h2>Performance Summary</h2>
        <p>Experiments: ${aggregatedData.experimentCount}</p>
        <p>Started: ${new Date(aggregatedData.startTime).toLocaleString()}</p>
        <p>Ended: ${new Date(aggregatedData.endTime).toLocaleString()}</p>
        <p>Total Runtime: ${formatDuration(aggregatedData.endTime - aggregatedData.startTime)}</p>
        <p>Total Step Time: ${formatDuration(aggregatedData.totalDuration)}</p>
      </div>
      
      <div class="step-details">
        <h2>Step Statistics</h2>
        <table>
          <thead>
            <tr>
              <th>Step Name</th>
              <th>Count</th>
              <th>Success Rate</th>
              <th>Min Duration</th>
              <th>Avg Duration</th>
              <th>Median Duration</th>
              <th>Max Duration</th>
            </tr>
          </thead>
          <tbody>
            ${generateStepStatsRows(aggregatedData.stepStats)}
          </tbody>
        </table>
      </div>
      
      <div class="chart-container">
        <div class="chart">
          <div class="chart-title">Step Duration Statistics</div>
          <canvas id="durationChart"></canvas>
        </div>
        <div class="chart">
          <div class="chart-title">Step Success Rate</div>
          <canvas id="successRateChart"></canvas>
        </div>
      </div>
      
      <div class="category-filter">
        <h3>Filter by Experiment Category</h3>
        <button class="filter-btn active" data-category="all">All Categories</button>
        ${generateCategoryFilterButtons(aggregatedData.experiments)}
      </div>
      
      <div class="flame-graph">
        <h3>Timeline View (All Experiments)</h3>
        <div class="timeline">
          ${generateTimelineTicks(aggregatedData.startTime, aggregatedData.endTime)}
        </div>
        <div id="graph-content">
          ${generateAggregatedStepBars(aggregatedData)}
        </div>
        <div id="tooltip" class="tooltip"></div>
      </div>
      
      <h2>Experiment Details</h2>
      <div class="experiment-summary">
        ${generateExperimentCards(aggregatedData.experiments)}
      </div>
      
      <script>
        // Initialize Charts
        document.addEventListener('DOMContentLoaded', function() {
          // Duration Chart
          const durationCtx = document.getElementById('durationChart').getContext('2d');
          new Chart(durationCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(Object.keys(aggregatedData.stepStats))},
              datasets: [
                {
                  label: 'Min Duration (ms)',
                  data: ${JSON.stringify(Object.values(aggregatedData.stepStats).map(s => s.minDuration))},
                  backgroundColor: 'rgba(54, 162, 235, 0.5)',
                  borderColor: 'rgba(54, 162, 235, 1)',
                  borderWidth: 1
                },
                {
                  label: 'Avg Duration (ms)',
                  data: ${JSON.stringify(Object.values(aggregatedData.stepStats).map(s => s.avgDuration))},
                  backgroundColor: 'rgba(255, 206, 86, 0.5)',
                  borderColor: 'rgba(255, 206, 86, 1)',
                  borderWidth: 1
                },
                {
                  label: 'Max Duration (ms)',
                  data: ${JSON.stringify(Object.values(aggregatedData.stepStats).map(s => s.maxDuration))},
                  backgroundColor: 'rgba(255, 99, 132, 0.5)',
                  borderColor: 'rgba(255, 99, 132, 1)',
                  borderWidth: 1
                }
              ]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true,
                  title: {
                    display: true,
                    text: 'Duration (ms)'
                  }
                }
              }
            }
          });
          
          // Success Rate Chart
          const successRateCtx = document.getElementById('successRateChart').getContext('2d');
          new Chart(successRateCtx, {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(Object.keys(aggregatedData.stepStats))},
              datasets: [
                {
                  label: 'Success Rate (%)',
                  data: ${JSON.stringify(Object.values(aggregatedData.stepStats).map(s => (s.successCount / s.count) * 100))},
                  backgroundColor: 'rgba(75, 192, 192, 0.5)',
                  borderColor: 'rgba(75, 192, 192, 1)',
                  borderWidth: 1
                }
              ]
            },
            options: {
              scales: {
                y: {
                  beginAtZero: true,
                  max: 100,
                  title: {
                    display: true,
                    text: 'Success Rate (%)'
                  }
                }
              }
            }
          });
        });
        
        // JavaScript for interactivity
        document.querySelectorAll('.step-bar').forEach(bar => {
          bar.addEventListener('mouseover', event => {
            const tooltip = document.getElementById('tooltip');
            tooltip.innerHTML = bar.getAttribute('data-tooltip');
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY + 10) + 'px';
            tooltip.style.opacity = 1;
          });
          
          bar.addEventListener('mouseout', () => {
            document.getElementById('tooltip').style.opacity = 0;
          });
          
          bar.addEventListener('mousemove', event => {
            const tooltip = document.getElementById('tooltip');
            tooltip.style.left = (event.pageX + 10) + 'px';
            tooltip.style.top = (event.pageY + 10) + 'px';
          });
        });
        
        // Category filtering
        document.querySelectorAll('.filter-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Get selected category
            const category = btn.getAttribute('data-category');
            
            // Filter step bars
            document.querySelectorAll('.step-bar').forEach(bar => {
              if (category === 'all' || bar.getAttribute('data-category') === category) {
                bar.style.display = 'block';
              } else {
                bar.style.display = 'none';
              }
            });
          });
        });
      </script>
    </body>
    </html>
    `;
    
    return html;
  }
  
  /**
   * Save aggregated flame graph visualization to a file
   * 
   * @param runId Unique identifier for the run
   * @param outputDir Directory to save the flame graph in
   * @param experimentIds Array of experiment IDs to include in the aggregate
   * @param runName Optional name for the run
   * @returns Promise that resolves to the file path where the flame graph was saved
   */
  public async saveAggregatedFlameGraph(
    runId: string, 
    outputDir: string, 
    experimentIds: string[], 
    runName?: string
  ): Promise<string> {
    // Log debug info about available experiments
    console.log(`[DEBUG] Attempting to aggregate performance data for run ${runId}`);
    console.log(`[DEBUG] Experiment IDs provided: ${experimentIds.length}`);
    console.log(`[DEBUG] Experiment IDs available in performance data: ${Array.from(this.performanceData.keys()).length}`);
    console.log(`[DEBUG] Matching experiment IDs: ${experimentIds.filter(id => this.performanceData.has(id)).length}`);
    
    // Aggregate the performance data
    const aggregatedData = this.aggregatePerformanceData(runId, experimentIds, runName);
    
    console.log(`[DEBUG] Aggregated data stats: ${aggregatedData.experimentCount} experiments, ${aggregatedData.allSteps.length} steps`);
    
    // Generate the HTML
    const html = this.generateAggregatedFlameGraphHtml(runId);
    
    // Create flamegraph directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });
    
    // Save the flame graph HTML
    const filePath = path.join(outputDir, 'aggregated_flamegraph.html');
    await fs.writeFile(filePath, html);
    
    // Save the raw aggregated data as JSON
    if (aggregatedData) {
      const jsonPath = path.join(outputDir, 'aggregated_performance_data.json');
      await fs.writeFile(jsonPath, JSON.stringify(aggregatedData, null, 2));
    }
    
    return filePath;
  }
}

/**
 * Format a duration in milliseconds to a human-readable string
 */
function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  } else if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(2)}s`;
  } else {
    const minutes = Math.floor(durationMs / 60000);
    const seconds = ((durationMs % 60000) / 1000).toFixed(1);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Generate HTML for timeline ticks
 */
function generateTimelineTicks(startTime: number, endTime: number): string {
  const duration = endTime - startTime;
  const tickCount = Math.min(10, Math.max(5, Math.floor(duration / 1000)));
  const tickInterval = duration / tickCount;
  
  let html = '';
  for (let i = 0; i <= tickCount; i++) {
    const tickTime = startTime + (i * tickInterval);
    const offsetPercent = (i * 100) / tickCount;
    
    const relativeTime = formatDuration(tickTime - startTime);
    
    html += `
      <div class="timeline-tick" style="left: ${offsetPercent}%">
        ${relativeTime}
      </div>
    `;
  }
  
  return html;
}

/**
 * Generate HTML for step bars in the flame graph
 */
function generateStepBars(experiment: ExperimentPerformanceData): string {
  const { startTime, endTime, steps } = experiment;
  const totalDuration = endTime - startTime;
  
  // Group steps by their type to stack them vertically
  const stepTypes = new Set(steps.map(step => step.stepName));
  const stepTypeToRow = new Map([...stepTypes].map((type, index) => [type, index]));
  
  let html = '';
  steps.forEach(step => {
    const left = ((step.startTime - startTime) / totalDuration) * 100;
    const width = (step.duration / totalDuration) * 100;
    const top = stepTypeToRow.get(step.stepName)! * 60;
    
    const stepClass = step.success ? 'success' : 'failure';
    
    const tooltip = `
      <strong>${step.stepName}</strong><br>
      Duration: ${formatDuration(step.duration)}<br>
      Status: ${step.success ? 'Success' : 'Failure'}<br>
      Start: ${new Date(step.startTime).toLocaleTimeString()}<br>
      End: ${new Date(step.endTime).toLocaleTimeString()}
      ${step.error ? `<br>Error: ${step.error}` : ''}
    `;
    
    html += `
      <div 
        class="step-bar ${stepClass}" 
        style="left: ${left}%; width: ${width}%; top: ${top}px;"
        data-tooltip="${tooltip.replace(/"/g, '&quot;')}"
      >
        ${step.stepName} (${formatDuration(step.duration)})
      </div>
    `;
  });
  
  return html;
}

/**
 * Generate HTML table rows for step details
 */
function generateStepRows(steps: StepTimingData[]): string {
  return steps.map(step => {
    const statusClass = step.success ? 'status-success' : 'status-failure';
    const statusText = step.success ? 'Success' : 'Failure';
    
    return `
      <tr>
        <td>${step.stepName}</td>
        <td class="${statusClass}">${statusText}</td>
        <td>${new Date(step.startTime).toLocaleTimeString()}</td>
        <td class="duration-cell">${formatDuration(step.duration)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Generate HTML table rows for step statistics
 */
function generateStepStatsRows(stepStats: Record<string, StepStatistics>): string {
  return Object.values(stepStats).map(stat => {
    const successRate = `${((stat.successCount / stat.count) * 100).toFixed(1)}%`;
    const successClass = (stat.successCount / stat.count) > 0.95 ? 'status-success' : 'status-failure';
    
    return `
      <tr>
        <td>${stat.stepName}</td>
        <td>${stat.count}</td>
        <td class="${successClass}">${successRate} (${stat.successCount}/${stat.count})</td>
        <td class="duration-cell">${formatDuration(stat.minDuration)}</td>
        <td class="duration-cell">${formatDuration(stat.avgDuration)}</td>
        <td class="duration-cell">${formatDuration(stat.medianDuration)}</td>
        <td class="duration-cell">${formatDuration(stat.maxDuration)}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Generate HTML for category filter buttons
 */
function generateCategoryFilterButtons(experiments: ExperimentPerformanceData[]): string {
  // Get unique categories from experiments
  const categories = new Set<string>();
  experiments.forEach(exp => {
    if (exp.experimentLabel) {
      categories.add(exp.experimentLabel);
    }
  });
  
  return Array.from(categories).map(category => {
    return `<button class="filter-btn" data-category="${category}">${category}</button>`;
  }).join('');
}

/**
 * Generate HTML for experiment cards
 */
function generateExperimentCards(experiments: ExperimentPerformanceData[]): string {
  return experiments.map(exp => {
    const duration = formatDuration(exp.totalDuration);
    const label = exp.experimentLabel || 'Uncategorized';
    const stepCount = exp.steps.length;
    const successCount = exp.steps.filter(step => step.success).length;
    
    return `
      <div class="experiment-card" data-category="${label}">
        <h3 title="${exp.experimentId}">${exp.experimentId}</h3>
        <p>Category: ${label}</p>
        <p>Duration: ${duration}</p>
        <p>Steps: ${stepCount} (${successCount} successful)</p>
        <a href="flamegraph/${exp.experimentId}/flamegraph.html" target="_blank">View Flame Graph</a>
      </div>
    `;
  }).join('');
}

/**
 * Generate HTML for aggregated step bars in the flame graph
 */
function generateAggregatedStepBars(aggregatedData: AggregatedPerformanceData): string {
  const { startTime, endTime, allSteps } = aggregatedData;
  const totalDuration = endTime - startTime;
  
  // Group steps by their type and experiment to stack them
  const experiments = new Map<string, number>();
  aggregatedData.experiments.forEach((exp, index) => {
    experiments.set(exp.experimentId, index);
  });
  
  let html = '';
  allSteps.forEach(step => {
    if (!step.experimentId) return; // Skip steps without experiment ID
    
    const experimentIndex = experiments.get(step.experimentId) || 0;
    const left = ((step.startTime - startTime) / totalDuration) * 100;
    const width = (step.duration / totalDuration) * 100;
    const top = experimentIndex * 30; // 30px per experiment row
    
    const stepClass = step.success ? 'success' : 'failure';
    const experiment = aggregatedData.experiments.find(e => e.experimentId === step.experimentId);
    const category = experiment?.experimentLabel || 'unknown';
    
    const tooltip = `
      <strong>${step.stepName}</strong><br>
      Experiment: ${step.experimentId}<br>
      Category: ${category}<br>
      Duration: ${formatDuration(step.duration)}<br>
      Status: ${step.success ? 'Success' : 'Failure'}<br>
      Start: ${new Date(step.startTime).toLocaleTimeString()}<br>
      End: ${new Date(step.endTime).toLocaleTimeString()}
      ${step.error ? `<br>Error: ${step.error}` : ''}
    `;
    
    html += `
      <div 
        class="step-bar ${stepClass}" 
        style="left: ${left}%; width: ${width}%; top: ${top}px;"
        data-tooltip="${tooltip.replace(/"/g, '&quot;')}"
        data-category="${category}"
        data-experiment="${step.experimentId}"
      >
        ${step.stepName}
      </div>
    `;
  });
  
  return html;
}