import QtQuick
import QtQuick.Templates as T

T.TabButton {
    id: control
    property color accentColor: "#1976d2"
    implicitWidth: Math.max(100, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: 40
    padding: 8
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    contentItem: Text {
        text: control.text
        font: control.font
        color: control.checked ? "white" : control.palette.windowText
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    background: Rectangle {
        radius: 4
        color: control.checked ? control.accentColor : control.hovered ? control.palette.button : "transparent"
        border.width: control.visualFocus ? 2 : 0
        border.color: control.accentColor
    }
}
