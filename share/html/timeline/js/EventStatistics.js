class EventStatistics {
    constructor(events, start, stop) {
        this.events = events;
        this.start = start;
        this.stop = stop;
    }

    compute() {
        const stats = {};
        for (const event of this.events) {
            const group = event.group_id || "Ungrouped";
            const name = event.name || "Unnamed";
            if (!stats[group]) {
                stats[group] = {};
            }
            if (!stats[group][name]) {
                stats[group][name] = {min: Infinity, max: -Infinity, med: 0, total: 0, count: 0, sum_of_squares: 0, durations: [], domain: event.domain, unit: event.unit};
            }
            const duration = Math.max(0, Math.min(event.stop, this.stop) - Math.max(event.start, this.start));
            stats[group][name].durations.push(duration);
            stats[group][name].total += duration;
            stats[group][name].count++;
            stats[group][name].sum_of_squares += duration * duration;
            if (duration < stats[group][name].min) {
                stats[group][name].min = duration;
            }
            if (duration > stats[group][name].max) {
                stats[group][name].max = duration;
            }
        }

        // Now compute the statistics for each group and name
        const result = [];
        for (const group in stats) {
            for (const name in stats[group]) {

                const durations = stats[group][name];
                const count = durations.count;
                if (count === 0) continue; // Avoid division by zero
                const pct = (durations.total / (this.stop - this.start)) * 100;
                const totalDuration = durations.total;
                const avgDuration = totalDuration / count;
                const minDuration = durations.min;
                const maxDuration = durations.max;
                const medDuration = durations.durations.sort((a, b) => a - b)[Math.floor(count / 2)];
                const variance = (durations.sum_of_squares / count) - (avgDuration * avgDuration);
                const stddevDuration = Math.sqrt(Math.max(0, variance));

                result.push([
                    pct,
                    name,
                    count,
                    totalDuration,
                    avgDuration,
                    minDuration,
                    maxDuration,
                    medDuration,
                    stddevDuration,
                    durations.domain,
                    durations.unit
                ]);
            }
        }

        result.sort((a, b) => b[3] - a[3]); // Sort by total duration descending
        
        result.unshift(["Percent (%)", "Name", "Count", "Tot. Dur. (ns)", "Avg (ns)", "Min (ns)", "Max (ns)", "Med (ns)", "StdDev (ns)", "Domain", "Unit"]);

        return result;
    }
}