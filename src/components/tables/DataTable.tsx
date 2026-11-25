import React, { useCallback, useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../../theme/theme';

export type TableColumn = {
  key: string;
  header: string;
  width: number;
  render: (row: any) => React.ReactNode;
};

type TableRowProps = {
  row: any;
  index: number;
  columns: TableColumn[];
};

const TableRow = React.memo(function TableRow({ row, index, columns }: TableRowProps) {
  return (
    <View style={[styles.tr, index % 2 === 1 && styles.alt]}>
      {columns.map(column => (
        <View key={column.key} style={[styles.td, { width: column.width }]}>
          {column.render(row)}
        </View>
      ))}
    </View>
  );
});

export function DataTable({ columns, rows }: { columns: TableColumn[]; rows: any[] }) {
  const width = useMemo(() => columns.reduce((sum, column) => sum + column.width, 0), [columns]);

  const header = useMemo(
    () => (
      <View style={styles.head}>
        {columns.map(column => (
          <Text key={column.key} style={[styles.th, { width: column.width }]}>
            {column.header}
          </Text>
        ))}
      </View>
    ),
    [columns],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: any; index: number }) => (
      <TableRow row={item} index={index} columns={columns} />
    ),
    [columns],
  );

  const keyExtractor = useCallback(
    (row: any, index: number) => String(row?.key ?? row?._id ?? row?.id ?? index),
    [],
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.wrap}>
      <View style={{ width }}>
        {header}
        <FlatList
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          scrollEnabled={false}
          initialNumToRender={18}
          maxToRenderPerBatch={12}
          windowSize={8}
          removeClippedSubviews
        />
      </View>
    </ScrollView>
  );
}

export function CellText({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <Text style={[styles.cell, strong && styles.strong]} numberOfLines={2}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  head: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  th: { paddingHorizontal: 12, paddingVertical: 12, color: '#475569', fontFamily: type.bold, fontSize: 12 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eef2f7', backgroundColor: '#fff' },
  alt: { backgroundColor: '#f8fafc' },
  td: { paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  cell: { color: '#0f172a', fontFamily: type.regular, fontSize: 13 },
  strong: { fontFamily: type.bold },
});