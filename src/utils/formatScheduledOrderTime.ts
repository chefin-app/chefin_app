/** Discovery scheduling uses 30-minute windows in Malaysia time. */
export function formatScheduledOrderTime(scheduledAt: string): string {
  const start = new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return 'Choose a time';
  const end = new Date(start.getTime() + 30 * 60_000);
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const dateLabel = (date: Date) => {
    const parts = dateFormatter.formatToParts(date);
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    return `${part('weekday')}, ${part('day')} ${part('month')}`;
  };
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const time = (date: Date) => {
    const parts = timeFormatter.formatToParts(date);
    const part = (type: string) => parts.find(value => value.type === type)?.value;
    return { clock: `${part('hour')}:${part('minute')}`, period: part('dayPeriod')?.toUpperCase() };
  };
  const from = time(start);
  const to = time(end);
  if (dateLabel(start) !== dateLabel(end)) {
    return `${dateLabel(start)}, ${from.clock} ${from.period} - ${dateLabel(end)}, ${to.clock} ${to.period}`;
  }
  return `${dateLabel(start)}, ${from.clock}${from.period === to.period ? '' : ` ${from.period}`} - ${to.clock} ${to.period}`;
}
