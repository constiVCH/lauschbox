import 'package:flutter/material.dart';

import 'ui/connect_screen.dart';

void main() => runApp(const LauschkisteApp());

class LauschkisteApp extends StatelessWidget {
  const LauschkisteApp({super.key});

  @override
  Widget build(BuildContext context) {
    ThemeData theme(Brightness b) => ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFE8663D), brightness: b),
          useMaterial3: true,
          cardTheme: const CardThemeData(clipBehavior: Clip.antiAlias),
        );
    return MaterialApp(
      title: 'Lauschkiste',
      debugShowCheckedModeBanner: false,
      theme: theme(Brightness.light),
      darkTheme: theme(Brightness.dark),
      home: const ConnectScreen(),
    );
  }
}
