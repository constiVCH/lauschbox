import 'package:flutter/material.dart';

import '../box/demo_box.dart';
import 'home_screen.dart';

/// Box auswählen. Später: Boxen per mDNS (_lauschbox._tcp) finden, neue Box per BLE einrichten.
class ConnectScreen extends StatelessWidget {
  const ConnectScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: ListView(
              padding: const EdgeInsets.all(24),
              children: [
                const SizedBox(height: 32),
                Center(child: Image.asset('assets/logo.png', width: 112, height: 112, semanticLabel: 'Lauschbox-Logo')),
                const SizedBox(height: 8),
                Text('Lauschbox', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 4),
                Text('Token auflegen, Geschichte hören.',
                    textAlign: TextAlign.center, style: TextStyle(color: scheme.onSurfaceVariant)),
                const SizedBox(height: 40),
                Text('Boxen im WLAN', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Card(
                  child: ListTile(
                    leading: const SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2)),
                    title: const Text('Suche läuft …'),
                    subtitle: const Text('Echte Boxen werden gefunden, sobald der box-daemon läuft.'),
                    enabled: false,
                  ),
                ),
                Card(
                  color: scheme.primaryContainer,
                  child: ListTile(
                    leading: const Icon(Icons.science_outlined),
                    title: const Text('Demo-Box'),
                    subtitle: const Text('Simulierte Box mit LED-Ring, Tastern und Token zum Ausprobieren'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      // Box außerhalb des builders anlegen: der builder kann mehrfach laufen
                      final box = DemoBox();
                      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => HomeScreen(box: box)));
                    },
                  ),
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: null,
                  icon: const Icon(Icons.bluetooth),
                  label: const Text('Neue Box einrichten (Bluetooth) – folgt in Phase 5'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
