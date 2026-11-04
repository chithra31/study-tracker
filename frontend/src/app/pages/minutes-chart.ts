import { Component, DestroyRef, ElementRef, effect, inject, input, viewChild } from '@angular/core';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { WeekMinutes } from '../models';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const label = (weekStart: string) =>
  new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Bar chart of minutes studied per week. */
@Component({
  selector: 'app-minutes-chart',
  template: `<div class="chart-box"><canvas #canvas></canvas></div>`,
})
export class MinutesChart {
  weeks = input.required<WeekMinutes[]>();
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart?: Chart;

  constructor() {
    effect(() => {
      const weeks = this.weeks();
      const labels = weeks.map((w) => 'Week of ' + label(w.weekStart));
      const data = weeks.map((w) => w.minutes);
      if (this.chart) {
        this.chart.data.labels = labels;
        this.chart.data.datasets[0].data = data;
        this.chart.update();
        return;
      }
      this.chart = new Chart(this.canvas().nativeElement, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes', data, backgroundColor: '#4f6df5', borderRadius: 4 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, title: { display: true, text: 'Minutes' } } },
        },
      });
    });
    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}
