import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hoerspielbox/main.dart';

/// Ersatz für pumpAndSettle, das wegen der endlos laufenden LED-Animation nie fertig würde.
Future<void> settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('Demo-Box öffnen, Token auflegen, Tabs durchklicken', (tester) async {
    // Handybreite (400 logische Pixel), aber hoch genug, dass Simulator und Player gleichzeitig sichtbar sind
    tester.view.physicalSize = const Size(1200, 6000);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(const LauschringApp());
    await tester.tap(find.text('Demo-Box'));
    await settle(tester);

    expect(find.text('Box-Simulator'), findsOneWidget);
    expect(find.textContaining('Kein Token aufgelegt'), findsOneWidget);

    await tester.tap(find.text('Funkel 1'));
    await settle(tester);
    expect(find.textContaining('Kapitel 3 · 3 von 7'), findsOneWidget);

    await tester.tap(find.text('Token'));
    await settle(tester);
    expect(find.text('Kapitän Kraut'), findsWidgets);

    // App-Schutz: Bearbeiten verlangt die PIN
    await tester.tap(find.text('Schlaflieder').last);
    await settle(tester);
    expect(find.text('Eltern-PIN'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '1234');
    await settle(tester);
    expect(find.text('Token bearbeiten'), findsOneWidget);
    await tester.pageBack();
    await settle(tester);

    await tester.tap(find.text('Kindermodus').last);
    await settle(tester);
    expect(find.text('Maximallautstärke'), findsOneWidget);

    await tester.tap(find.text('Einstellungen'));
    await settle(tester);
    expect(find.text('Startlautstärke'), findsOneWidget);

    // Seite schließen, damit Timer der Demo-Box beendet werden
    await tester.tap(find.text('Verbindung trennen'));
    await settle(tester);
    expect(find.text('Lauschring'), findsOneWidget);
  });
}
