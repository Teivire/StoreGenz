import { NextResponse } from "next/server";
import { ensureSeeded, getSalesCollection } from "@/lib/db";

/**
 * GET /api/stats — Dashboard KPIs computed from MongoDB sales.
 *
 * Buckets are computed in the server's local timezone by flooring Date objects to
 * day boundaries, keeping the "today" definition consistent with the UI's clock.
 * Refunded sales are excluded from revenue and order counts.
 *
 * Returns:
 *   today         { revenue, orders, items }
 *   lastWeekSame  { revenue, orders }   (same local weekday, 7 days earlier)
 *   week          [{ day: "Mon", revenue, orders }] — 7 days ending today
 *   avgOrderValue { today, lastWeekSame }
 *   refunds       { count, amount }
 *   expenses      { today } — placeholder 0 until expense records exist
 */
export async function GET() {
  try {
    await ensureSeeded();
    const sales = await getSalesCollection();

    // Floor "now" to the local day boundary and derive the window edges.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWindow = new Date(startOfToday);
    startOfWindow.setDate(startOfWindow.getDate() - 13); // today + previous 13 days
    const startOfLastWeekDay = new Date(startOfToday);
    startOfLastWeekDay.setDate(startOfLastWeekDay.getDate() - 7);
    const endOfLastWeekDay = new Date(startOfToday);

    const revenueExpr = {
      $sum: {
        $map: {
          input: "$lines",
          as: "l",
          in: { $multiply: ["$$l.price", "$$l.qty"] }
        }
      }
    };
    const itemsExpr = { $sum: { $sum: "$lines.qty" } };

    // One pipeline pass over the window, bucketed by local day, split by refund status.
    const buckets = await sales
      .aggregate([
        { $match: { createdAt: { $gte: startOfWindow } } },
        {
          $group: {
            _id: {
              day: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                }
              }
            },
            revenue: { $sum: revenueExpr },
            orders: { $sum: 1 },
            items: itemsExpr,
            refundedTotal: {
              $sum: {
                $cond: [{ $eq: ["$status", "Refunded"] }, revenueExpr, 0]
              }
            },
            paidRevenue: {
              $sum: {
                $cond: [{ $ne: ["$status", "Refunded"] }, revenueExpr, 0]
              }
            },
            paidOrders: {
              $sum: {
                $cond: [{ $ne: ["$status", "Refunded"] }, 1, 0]
              }
            }
          }
        }
      ])
      .toArray();

    const byDay = new Map<string, { revenue: number; orders: number; items: number }>();
    let today = { revenue: 0, orders: 0, items: 0 };
    let lastWeekSame = { revenue: 0, orders: 0 };
    let refunds = { count: 0, amount: 0 };
    const dayKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const todayKey = dayKey(startOfToday);
    const lastWeekKey = dayKey(startOfLastWeekDay);

    for (const b of buckets) {
      const key = b._id.day;
      const prev = byDay.get(key) ?? { revenue: 0, orders: 0, items: 0 };
      byDay.set(key, { revenue: prev.revenue + b.paidRevenue, orders: prev.orders + b.paidOrders, items: prev.items + b.items });
      refunds.count += b.orders - b.paidOrders;
      refunds.amount += b.refundedTotal;
      if (key === todayKey) today = { revenue: b.paidRevenue, orders: b.paidOrders, items: b.items };
      if (key === lastWeekKey) lastWeekSame = { revenue: b.paidRevenue, orders: b.paidOrders };
    }

    // Build a 7-day series ending today with stable weekday labels.
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const week: { day: string; revenue: number; orders: number }[] = [];
    const startOf7 = new Date(startOfToday);
    startOf7.setDate(startOf7.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOf7);
      d.setDate(d.getDate() + i);
      const bucket = byDay.get(dayKey(d));
      week.push({ day: dayNames[d.getDay()], revenue: Math.round(bucket?.revenue ?? 0), orders: bucket?.orders ?? 0 });
    }

    const avgOrderValue = {
      today: today.orders > 0 ? today.revenue / today.orders : 0,
      lastWeekSame: lastWeekSame.orders > 0 ? lastWeekSame.revenue / lastWeekSame.orders : 0
    };

    return NextResponse.json({ today, lastWeekSame, week, avgOrderValue, refunds, expenses: { today: 0 } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
