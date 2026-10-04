import QtQuick
import QtQuick.Templates as T

T.SpinBox {
    id: control
    property color accentColor: "#1976d2"
    signal textEdited(string text)
    readonly property string rawText: editor.text
    readonly property bool rawAcceptable: /^\d+$/.test(editor.text.trim()) &&
        Number(editor.text) >= Math.min(from, to) && Number(editor.text) <= Math.max(from, to)
    implicitWidth: 130
    implicitHeight: 40
    padding: 1
    leftPadding: 31
    rightPadding: 31
    live: true
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    validator: IntValidator { bottom: Math.min(control.from, control.to); top: Math.max(control.from, control.to) }
    valueFromText: function(text, locale) {
        var trimmed = String(text).trim(), number = Number(trimmed)
        // Invalid unfinished input must stay visible and must not be clamped
        // into a seemingly valid range when the field loses focus.
        return /^\d+$/.test(trimmed) && number >= Math.min(control.from, control.to) && number <= Math.max(control.from, control.to) ? number : control.value
    }
    function synchronizeEditor() {
        if (!editor.activeFocus || control.up.pressed || control.down.pressed) editor.text = String(control.value)
    }
    onValueChanged: synchronizeEditor()
    onValueModified: editor.text = String(control.value)
    contentItem: TextInput {
        id: editor
        objectName: "spinEditor"
        clip: true
        font: control.font
        color: control.palette.text
        selectionColor: control.accentColor
        selectedTextColor: "white"
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        readOnly: !control.editable
        validator: control.validator
        inputMethodHints: Qt.ImhDigitsOnly
        selectByMouse: true
        Component.onCompleted: text = String(control.value)
        onTextEdited: control.textEdited(text)
        onActiveFocusChanged: {
            if (!activeFocus) {
                // Forward raw input again after native focus-loss processing.
                // The caller can block export even when value is still valid.
                control.textEdited(text)
                if (control.rawAcceptable) text = String(control.value)
            }
        }
        onAccepted: {
            control.textEdited(text)
            if (control.rawAcceptable) text = String(control.value)
        }
    }
    up.indicator: Rectangle {
        x: control.mirrored ? 0 : control.width - width
        width: 30
        height: control.height
        color: control.up.pressed ? control.accentColor : control.palette.button
        border.color: control.up.hovered || control.up.pressed ? control.accentColor : control.palette.mid
        radius: 4
        Text { anchors.centerIn: parent; text: "+"; font.pixelSize: 20; color: control.up.pressed ? "white" : control.accentColor }
    }
    down.indicator: Rectangle {
        x: control.mirrored ? control.width - width : 0
        width: 30
        height: control.height
        color: control.down.pressed ? control.accentColor : control.palette.button
        border.color: control.down.hovered || control.down.pressed ? control.accentColor : control.palette.mid
        radius: 4
        Text { anchors.centerIn: parent; text: "−"; font.pixelSize: 20; color: control.down.pressed ? "white" : control.accentColor }
    }
    background: Rectangle {
        radius: 4
        color: control.palette.base
        border.width: control.activeFocus ? 2 : 1
        border.color: control.activeFocus ? control.accentColor : control.palette.mid
    }
}
