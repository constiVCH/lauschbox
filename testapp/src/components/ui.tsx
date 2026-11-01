import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Switch, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

import { radius, space, type, useColors } from '@/theme';

import { Tap } from './Tap';

export type IconName = ComponentProps<typeof Ionicons>['name'];

type TxtProps = TextProps & { variant?: keyof typeof type; color?: 'primary' | 'secondary' | 'tertiary' | 'accent' | string };

export function Txt({ variant = 'body', color = 'primary', style, ...rest }: TxtProps) {
  const c = useColors();
  const resolved =
    color === 'primary' ? c.text : color === 'secondary' ? c.textSecondary : color === 'tertiary' ? c.textTertiary : color === 'accent' ? c.accentText : color;
  return <Text {...rest} style={[type[variant] as TextStyle, { color: resolved }, style]} />;
}

/** Fläche für eine Gruppe zusammengehöriger Inhalte. Massiv, nicht durchscheinend: Inhalt soll ruhig lesbar sein. */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.surface }, padded && { padding: space.lg }, style]}>{children}</View>;
}

export function Section({ title, footer, children, action }: { title?: string; footer?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          {title ? (
            <Txt variant="footnote" color="secondary" style={styles.sectionTitle} accessibilityRole="header">
              {title.toUpperCase()}
            </Txt>
          ) : (
            <View />
          )}
          {action}
        </View>
      )}
      {children}
      {footer && (
        <Txt variant="footnote" color="tertiary" style={styles.sectionFooter}>
          {footer}
        </Txt>
      )}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'plain' | 'destructive';
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({ label, onPress, icon, kind = 'primary', disabled, compact, style, accessibilityHint }: ButtonProps) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'secondary' ? c.fillStrong : kind === 'destructive' ? c.fill : 'transparent';
  const fg = kind === 'primary' ? c.onAccent : kind === 'destructive' ? c.danger : kind === 'plain' ? c.accentText : c.text;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={[styles.button, compact && styles.buttonCompact, { backgroundColor: bg }, style]}
    >
      {icon && <Ionicons name={icon} size={compact ? 16 : 19} color={fg} />}
      <Txt variant={compact ? 'subhead' : 'headline'} color={fg} style={compact && { fontWeight: '600' }}>
        {label}
      </Txt>
    </Tap>
  );
}

/** Zeile in einer Liste: links Symbol und Text, rechts ein Bedienelement oder Wert. */
export function Row({
  title,
  subtitle,
  icon,
  iconColor,
  trailing,
  onPress,
  first,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  first?: boolean;
}) {
  const c = useColors();
  const content = (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.fillStrong }]}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: iconColor ?? c.accent }]}>
          <Ionicons name={icon} size={17} color="#fff" />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body">{title}</Txt>
        {subtitle && (
          <Txt variant="footnote" color="secondary">
            {subtitle}
          </Txt>
        )}
      </View>
      {trailing}
      {onPress && <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />}
    </View>
  );
  return onPress ? (
    <Tap onPress={onPress} scaleTo={0.985} haptic={null} accessibilityRole="button" accessibilityLabel={title}>
      {content}
    </Tap>
  ) : (
    content
  );
}

export function SwitchRow(props: { title: string; subtitle?: string; icon?: IconName; iconColor?: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }) {
  const c = useColors();
  return (
    <Row
      {...props}
      trailing={
        <Switch
          value={props.value}
          onValueChange={props.onChange}
          trackColor={{ true: c.accent, false: c.fillStrong }}
          thumbColor="#fff"
          accessibilityLabel={props.title}
        />
      }
    />
  );
}

/** Auswahl aus wenigen gleichrangigen Optionen. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.fill }]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Tap
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            haptic="selection"
            scaleTo={0.97}
            style={[styles.segment, active && { backgroundColor: c.surfaceRaised, ...styles.segmentActive }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
          >
            <Txt variant="subhead" style={{ fontWeight: active ? '600' : '500' }} color={active ? 'primary' : 'secondary'} numberOfLines={1}>
              {o.label}
            </Txt>
          </Tap>
        );
      })}
    </View>
  );
}

export function Pill({ text, color, icon }: { text: string; color: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '24' }]}>
      {icon ? <Ionicons name={icon} size={13} color={color} /> : <View style={[styles.dot, { backgroundColor: color }]} />}
      <Txt variant="caption" color={color}>
        {text}
      </Txt>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' },
  section: { gap: space.sm, marginBottom: space.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: space.xs },
  sectionTitle: { fontWeight: '600', letterSpacing: 0.6 },
  sectionFooter: { paddingHorizontal: space.xs },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  buttonCompact: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderRadius: radius.sm + 2, borderCurve: 'continuous', padding: 3 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 34, borderRadius: radius.sm - 1, paddingHorizontal: space.sm },
  segmentActive: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
