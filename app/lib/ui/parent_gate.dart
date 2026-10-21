import 'package:flutter/material.dart';

import '../box/box_connection.dart';

/// Eltern-PIN: einmal entsperrt bleibt die App bis „Sperren“ oder bis zum Verlassen der Box offen.
class ParentGate extends ChangeNotifier {
  ParentGate(this.box);

  final BoxConnection box;
  bool _unlocked = false;

  bool get unlocked => _unlocked;

  /// Einstellungen und Token-Verwaltung brauchen die PIN, wenn der App-Schutz an ist.
  bool get appOpen => _unlocked || !(box.kidMode.enabled && box.kidMode.protectApp);

  /// Der Kindermodus selbst lässt sich nur mit PIN ändern, solange er an ist.
  bool get kidModeOpen => _unlocked || !box.kidMode.enabled;

  Future<bool> ensureAppOpen(BuildContext context) async => appOpen || await unlock(context);

  Future<bool> unlock(BuildContext context) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => _PinDialog(box: box)) ?? false;
    if (ok) {
      _unlocked = true;
      notifyListeners();
    }
    return ok;
  }

  void lock() {
    _unlocked = false;
    notifyListeners();
  }
}

class _PinDialog extends StatefulWidget {
  const _PinDialog({required this.box});
  final BoxConnection box;

  @override
  State<_PinDialog> createState() => _PinDialogState();
}

class _PinDialogState extends State<_PinDialog> {
  final _controller = TextEditingController();
  String? _error;

  void _submit() {
    if (_controller.text == widget.box.kidMode.pin) {
      Navigator.pop(context, true);
    } else {
      setState(() => _error = 'Falsche PIN');
      _controller.clear();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      icon: const Icon(Icons.lock_outline),
      title: const Text('Eltern-PIN'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _controller,
            autofocus: true,
            obscureText: true,
            keyboardType: TextInputType.number,
            maxLength: 4,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 28, letterSpacing: 12),
            decoration: InputDecoration(errorText: _error, counterText: ''),
            onChanged: (v) {
              if (v.length == 4) _submit();
            },
            onSubmitted: (_) => _submit(),
          ),
          if (widget.box.isDemo) ...[
            const SizedBox(height: 8),
            Text('Demo-PIN: ${widget.box.kidMode.pin}', style: Theme.of(context).textTheme.bodySmall),
          ],
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Abbrechen')),
        FilledButton(onPressed: _submit, child: const Text('Entsperren')),
      ],
    );
  }
}
