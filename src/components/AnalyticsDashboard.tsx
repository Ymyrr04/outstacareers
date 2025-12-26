import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Eye, MousePointerClick, FileText, TrendingUp } from 'lucide-react';

interface AnalyticsSummary {
  totalPageViews: number;
  totalJobViews: number;
  totalApplyClicks: number;
  conversionRate: number;
}

interface JobAnalytics {
  job_id: string;
  job_title: string;
  views: number;
  clicks: number;
  conversion_rate: number;
}

interface DailyStats {
  date: string;
  page_views: number;
  job_views: number;
  apply_clicks: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))'];

const AnalyticsDashboard = () => {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [jobAnalytics, setJobAnalytics] = useState<JobAnalytics[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    
    try {
      // Fetch all events
      const { data: events, error } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate summary
      const pageViews = events?.filter(e => e.event_type === 'page_view').length || 0;
      const jobViews = events?.filter(e => e.event_type === 'job_view').length || 0;
      const applyClicks = events?.filter(e => e.event_type === 'apply_click').length || 0;
      
      setSummary({
        totalPageViews: pageViews,
        totalJobViews: jobViews,
        totalApplyClicks: applyClicks,
        conversionRate: jobViews > 0 ? Math.round((applyClicks / jobViews) * 100) : 0,
      });

      // Calculate per-job analytics
      const { data: jobs } = await supabase.from('jobs').select('id, title');
      const jobMap = new Map(jobs?.map(j => [j.id, j.title]) || []);

      const jobStats = new Map<string, { views: number; clicks: number }>();
      
      events?.forEach(event => {
        if (event.job_id && (event.event_type === 'job_view' || event.event_type === 'apply_click')) {
          if (!jobStats.has(event.job_id)) {
            jobStats.set(event.job_id, { views: 0, clicks: 0 });
          }
          const stats = jobStats.get(event.job_id)!;
          if (event.event_type === 'job_view') stats.views++;
          if (event.event_type === 'apply_click') stats.clicks++;
        }
      });

      const jobAnalyticsData: JobAnalytics[] = Array.from(jobStats.entries())
        .map(([jobId, stats]) => ({
          job_id: jobId,
          job_title: jobMap.get(jobId) || 'Unknown Job',
          views: stats.views,
          clicks: stats.clicks,
          conversion_rate: stats.views > 0 ? Math.round((stats.clicks / stats.views) * 100) : 0,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      setJobAnalytics(jobAnalyticsData);

      // Calculate daily stats (last 7 days)
      const now = new Date();
      const dailyData: DailyStats[] = [];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayEvents = events?.filter(e => e.created_at.startsWith(dateStr)) || [];
        
        dailyData.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          page_views: dayEvents.filter(e => e.event_type === 'page_view').length,
          job_views: dayEvents.filter(e => e.event_type === 'job_view').length,
          apply_clicks: dayEvents.filter(e => e.event_type === 'apply_click').length,
        });
      }
      
      setDailyStats(dailyData);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    );
  }

  const pieData = [
    { name: 'Page Views', value: summary?.totalPageViews || 0 },
    { name: 'Job Views', value: summary?.totalJobViews || 0 },
    { name: 'Apply Clicks', value: summary?.totalApplyClicks || 0 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Page Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalPageViews || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Job Views</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalJobViews || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Apply Clicks</CardTitle>
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalApplyClicks || 0}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.conversionRate || 0}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Last 7 Days Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar dataKey="page_views" name="Page Views" fill="hsl(var(--primary))" />
                  <Bar dataKey="job_views" name="Job Views" fill="hsl(var(--secondary))" />
                  <Bar dataKey="apply_clicks" name="Apply Clicks" fill="hsl(var(--accent))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Event Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Event Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Jobs Table */}
      {jobAnalytics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-medium">Job Title</th>
                    <th className="text-right py-2 px-4 font-medium">Views</th>
                    <th className="text-right py-2 px-4 font-medium">Clicks</th>
                    <th className="text-right py-2 px-4 font-medium">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {jobAnalytics.map((job) => (
                    <tr key={job.job_id} className="border-b last:border-0">
                      <td className="py-2 px-4 truncate max-w-[300px]">{job.job_title}</td>
                      <td className="text-right py-2 px-4">{job.views}</td>
                      <td className="text-right py-2 px-4">{job.clicks}</td>
                      <td className="text-right py-2 px-4">{job.conversion_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
