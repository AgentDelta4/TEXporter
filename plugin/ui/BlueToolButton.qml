import QtQuick
import QtQuick.Templates as T

T.ToolButton {
    id: control
    property color accentColor: "#1976d2"
    implicitWidth: Math.max(40, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: Math.max(36, implicitContentHeight + topPadding + bottomPadding)
    padding: 6
    horizontalPadding: 10
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    contentItem: Text {
        text: control.text
        font: control.font
        color: control.checked || control.highlighted ? "white" : control.palette.buttonText
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    background: Rectangle {
        radius: 4
        color: control.checked || control.highlighted ? control.accentColor :
            control.down ? control.palette.mid : control.hovered ? control.palette.button : "transparent"
        border.width: control.visualFocus ? 2 : control.hovered ? 1 : 0
        border.color: control.accentColor
    }
}
