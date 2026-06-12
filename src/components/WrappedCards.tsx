import React from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  // Aliased so a future expo-linear-gradient import can't collide.
  LinearGradient as SkLinearGradient,
  RoundedRect,
  Text as SkText,
  useFont,
  vec,
} from '@shopify/react-native-skia';
import type { CanvasRef, SkFont } from '@shopify/react-native-skia';
import { Sora_400Regular, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import { theme, withAlpha } from '../theme';
import { familyStyle, WidgetFamily } from '../utils/widgetFamilies';
import { monthTitle, MonthStats } from '../services/wrapped';

// Cards are designed on a fixed 360×640 (9:16) board and the whole Canvas is
// scaled to the rendered width, so the on-screen card and the high-res share
// snapshot are the same drawing.
const DESIGN_W = 360;
const DESIGN_H = 640;
const MARGIN = 36; // safe margin — no text outside [MARGIN, DESIGN_W - MARGIN]
const CONTENT_W = DESIGN_W - MARGIN * 2;

export const WRAPPED_CARD_COUNT = 3;

export interface WrappedCardProps {
  month: string;
  stats: MonthStats;
  /** Rendered width in px; height is always width × 16/9. */
  width: number;
  /** Attach to snapshot this card (share flow). */
  canvasRef?: React.RefObject<CanvasRef | null>;
}

// ── Fonts ─────────────────────────────────────────────────────────────────────
// Skia draws its own glyphs, so the RN font registry is invisible to it — each
// size needs the raw ttf loaded into an SkFont.

interface WrappedFonts {
  mega: SkFont;
  big: SkFont;
  title: SkFont;
  stat: SkFont;
  body: SkFont;
  label: SkFont;
}

// Exported so WrappedScreen can gate the Share button on font readiness —
// snapshotting before fonts resolve yields an empty placeholder, not a card.
export function useWrappedFonts(): WrappedFonts | null {
  const mega = useFont(Sora_800ExtraBold, 78);
  const big = useFont(Sora_800ExtraBold, 44);
  const title = useFont(Sora_700Bold, 22);
  const stat = useFont(Sora_700Bold, 24);
  const body = useFont(Sora_400Regular, 15);
  const label = useFont(Sora_400Regular, 12);
  if (!mega || !big || !title || !stat || !body || !label) return null;
  return { mega, big, title, stat, body, label };
}

// ── Helpers (design-space) ────────────────────────────────────────────────────

const textW = (font: SkFont, text: string) => font.measureText(text).width;
const centerX = (font: SkFont, text: string) => (DESIGN_W - textW(font, text)) / 2;

/** Trims with an ellipsis until the text fits maxW. */
function fitText(font: SkFont, text: string, maxW: number): string {
  if (textW(font, text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && textW(font, `${t}…`) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function fmtKm(km: number): string {
  return km >= 100 ? String(Math.round(km)) : String(Math.round(km * 10) / 10);
}

function fmtDay(dayKey: string): string {
  return `${parseInt(dayKey.slice(8, 10), 10)} ${monthTitle(dayKey.slice(0, 7), true).split(' ')[0]}`;
}

const WHITE = theme.colors.text;
const SECONDARY = theme.colors.textSecondary;

// Dark, desaturated tails of each family gradient — the bright family colours
// stay in accents while the card background reads premium-dark.
const FAMILY_DARK: Partial<Record<WidgetFamily, string>> = {
  activity: '#3B1A08',
  plan: '#291347',
  records: '#3B2B07',
};

// ── Shared chrome ─────────────────────────────────────────────────────────────

function CardChrome({
  family,
  overline,
  month,
  fonts,
}: {
  family: WidgetFamily;
  overline: string;
  month: string;
  fonts: WrappedFonts;
}) {
  const fam = familyStyle(family);
  const monthText = monthTitle(month);
  const watermark = 'STRAVA AI COACH';
  return (
    <>
      <RoundedRect x={0} y={0} width={DESIGN_W} height={DESIGN_H} r={28}>
        <SkLinearGradient
          start={vec(0, 0)}
          end={vec(DESIGN_W, DESIGN_H)}
          colors={['#16161F', FAMILY_DARK[family] ?? '#16161F', '#0D0D14']}
          positions={[0, 0.55, 1]}
        />
      </RoundedRect>
      {/* Soft accent glows behind the content. */}
      <Circle cx={DESIGN_W - 36} cy={64} r={150} color={withAlpha(fam.accent, 'soft')} />
      <Circle cx={28} cy={DESIGN_H - 80} r={110} color={withAlpha(fam.accent, 'faint')} />
      <RoundedRect
        x={1}
        y={1}
        width={DESIGN_W - 2}
        height={DESIGN_H - 2}
        r={27}
        style="stroke"
        strokeWidth={1.5}
        color={withAlpha(fam.accent, 'medium')}
      />
      <SkText x={centerX(fonts.label, overline)} y={66} text={overline} font={fonts.label} color={fam.accent} />
      <SkText x={centerX(fonts.title, monthText)} y={94} text={monthText} font={fonts.title} color={WHITE} />
      <SkText
        x={centerX(fonts.label, watermark)}
        y={DESIGN_H - 24}
        text={watermark}
        font={fonts.label}
        color={withAlpha(WHITE, 'strong')}
      />
    </>
  );
}

function CardCanvas({
  width,
  canvasRef,
  children,
}: {
  width: number;
  canvasRef?: React.RefObject<CanvasRef | null>;
  children: React.ReactNode;
}) {
  const height = Math.round((width * 16) / 9);
  return (
    <Canvas ref={canvasRef} style={{ width, height }}>
      <Group transform={[{ scale: width / DESIGN_W }]}>{children}</Group>
    </Canvas>
  );
}

/** Centered value-over-label stat column. */
function StatColumn({
  x,
  y,
  value,
  label,
  fonts,
  accent,
}: {
  x: number; // column centre
  y: number; // value baseline
  value: string;
  label: string;
  fonts: WrappedFonts;
  accent: string;
}) {
  return (
    <>
      <SkText x={x - textW(fonts.stat, value) / 2} y={y} text={value} font={fonts.stat} color={WHITE} />
      <SkText x={x - textW(fonts.label, label) / 2} y={y + 20} text={label} font={fonts.label} color={accent} />
    </>
  );
}

// ── Card 1: Volume ────────────────────────────────────────────────────────────

export function VolumeCard({ month, stats, width, canvasRef }: WrappedCardProps) {
  const fonts = useWrappedFonts();
  if (!fonts) return <View style={{ width, height: Math.round((width * 16) / 9) }} />;
  const fam = familyStyle('activity');
  const km = fmtKm(stats.km);
  return (
    <CardCanvas width={width} canvasRef={canvasRef}>
      <CardChrome family="activity" overline="MONTHLY WRAPPED · VOLUME" month={month} fonts={fonts} />
      <SkText x={centerX(fonts.mega, km)} y={330} text={km} font={fonts.mega} color={WHITE} />
      <SkText
        x={centerX(fonts.label, 'KILOMETRES')}
        y={362}
        text="KILOMETRES"
        font={fonts.label}
        color={SECONDARY}
      />
      <StatColumn x={78} y={478} value={fmtKm(stats.hours)} label="HOURS" fonts={fonts} accent={fam.accent} />
      <StatColumn x={180} y={478} value={String(stats.count)} label="ACTIVITIES" fonts={fonts} accent={fam.accent} />
      <StatColumn x={282} y={478} value={String(stats.activeDays)} label="ACTIVE DAYS" fonts={fonts} accent={fam.accent} />
    </CardCanvas>
  );
}

// ── Card 2: Highlights ────────────────────────────────────────────────────────

function HighlightRow({
  y,
  label,
  value,
  sub,
  fonts,
  accent,
}: {
  y: number;
  label: string;
  value: string;
  sub: string;
  fonts: WrappedFonts;
  accent: string;
}) {
  return (
    <>
      <SkText x={MARGIN} y={y} text={label} font={fonts.label} color={accent} />
      <SkText x={MARGIN} y={y + 30} text={fitText(fonts.stat, value, CONTENT_W)} font={fonts.stat} color={WHITE} />
      <SkText x={MARGIN} y={y + 52} text={fitText(fonts.body, sub, CONTENT_W)} font={fonts.body} color={SECONDARY} />
    </>
  );
}

export function HighlightsCard({ month, stats, width, canvasRef }: WrappedCardProps) {
  const fonts = useWrappedFonts();
  if (!fonts) return <View style={{ width, height: Math.round((width * 16) / 9) }} />;
  const fam = familyStyle('plan');
  const { longest, topSport, deltaPct } = stats;
  const deltaValue =
    deltaPct === null ? '—' : `${deltaPct >= 0 ? '+' : ''}${Math.round(deltaPct)}%`;
  const deltaSub =
    deltaPct === null
      ? 'No data for last month'
      : `${fmtKm(stats.km)} km vs ${fmtKm(stats.prevMonthKm)} km`;
  return (
    <CardCanvas width={width} canvasRef={canvasRef}>
      <CardChrome family="plan" overline="MONTHLY WRAPPED · HIGHLIGHTS" month={month} fonts={fonts} />
      <HighlightRow
        y={166}
        label="LONGEST SESSION"
        value={longest ? longest.name : 'No sessions yet'}
        sub={longest ? `${fmtKm(longest.km)} km · ${fmtDay(longest.dayKey)}` : 'Get out there'}
        fonts={fonts}
        accent={fam.accent}
      />
      <HighlightRow
        y={258}
        label="TOP SPORT"
        value={topSport ? topSport.type : '—'}
        sub={topSport ? `${topSport.count} session${topSport.count === 1 ? '' : 's'}` : ''}
        fonts={fonts}
        accent={fam.accent}
      />
      {/* Elevation + kudos share a row. */}
      <SkText x={MARGIN} y={350} text="ELEVATION" font={fonts.label} color={fam.accent} />
      <SkText x={MARGIN} y={380} text={`${Math.round(stats.elevation)} m`} font={fonts.stat} color={WHITE} />
      <SkText x={196} y={350} text="KUDOS" font={fonts.label} color={fam.accent} />
      <SkText x={196} y={380} text={String(stats.totalKudos)} font={fonts.stat} color={WHITE} />
      <HighlightRow
        y={442}
        label="VS LAST MONTH"
        value={deltaValue}
        sub={deltaSub}
        fonts={fonts}
        accent={fam.accent}
      />
    </CardCanvas>
  );
}

// ── Card 3: Records ───────────────────────────────────────────────────────────

export function RecordsCard({ month, stats, width, canvasRef }: WrappedCardProps) {
  const fonts = useWrappedFonts();
  if (!fonts) return <View style={{ width, height: Math.round((width * 16) / 9) }} />;
  const fam = familyStyle('records');
  const count = String(stats.badges.length);
  const countLabel = stats.badges.length === 1 ? 'BADGE EARNED' : 'BADGES EARNED';
  const titles = stats.badges.slice(0, 4).map((b) => b.title);
  const bestWeek = `${fmtKm(stats.bestWeekKm)} km`;
  return (
    <CardCanvas width={width} canvasRef={canvasRef}>
      <CardChrome family="records" overline="MONTHLY WRAPPED · RECORDS" month={month} fonts={fonts} />
      <SkText x={centerX(fonts.mega, count)} y={252} text={count} font={fonts.mega} color={WHITE} />
      <SkText x={centerX(fonts.label, countLabel)} y={284} text={countLabel} font={fonts.label} color={fam.accent} />
      {titles.length ? (
        titles.map((t, i) => {
          const line = fitText(fonts.body, t, CONTENT_W);
          return (
            <SkText
              key={i}
              x={centerX(fonts.body, line)}
              y={336 + i * 28}
              text={line}
              font={fonts.body}
              color={WHITE}
            />
          );
        })
      ) : (
        <SkText
          x={centerX(fonts.body, 'No new badges this month')}
          y={336}
          text="No new badges this month"
          font={fonts.body}
          color={SECONDARY}
        />
      )}
      <SkText x={centerX(fonts.label, 'BEST WEEK')} y={500} text="BEST WEEK" font={fonts.label} color={fam.accent} />
      <SkText x={centerX(fonts.big, bestWeek)} y={552} text={bestWeek} font={fonts.big} color={WHITE} />
    </CardCanvas>
  );
}

// ── Page picker ───────────────────────────────────────────────────────────────

/** The card for a pager index — keeps the on-screen and share renders in sync. */
export function WrappedCard({ page, ...props }: WrappedCardProps & { page: number }) {
  if (page === 1) return <HighlightsCard {...props} />;
  if (page === 2) return <RecordsCard {...props} />;
  return <VolumeCard {...props} />;
}
