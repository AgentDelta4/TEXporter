import QtQuick
import QtQuick.Templates as T

T.TextField {
    id: control
    property color accentColor: "#1976d2"
    implicitWidth: 140
    implicitHeight: Math.max(40, contentHeight + topPadding + bottomPadding)
    padding: 8
    color: palette.text
    selectionColor: accentColor
    selectedTextColor: "white"
    placeholderTextColor: palette.placeholderText
    verticalAlignment: Text.AlignVCenter
    opacity: enabled ? 1 : 0.5
    background: Rectangle {
        radius: 4
        color: control.palette.base
        border.width: control.activeFocus ? 2 : 1
        border.color: control.activeFocus ? control.accentColor : control.palette.mid
    }
}
