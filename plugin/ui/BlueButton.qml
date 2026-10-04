import QtQuick
import QtQuick.Templates as T

T.Button {
    id: control
    property color accentColor: "#1976d2"
    property bool primary: false
    implicitWidth: Math.max(100, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: Math.max(40, implicitContentHeight + topPadding + bottomPadding)
    padding: 8
    horizontalPadding: 14
    hoverEnabled: true
    opacity: enabled ? 1 : 0.5
    contentItem: Text {
        text: control.text
        font: control.font
        color: control.primary || control.checked || control.highlighted ? "white" : control.palette.buttonText
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    background: Rectangle {
        radius: 4
        color: control.primary || control.checked || control.highlighted ?
            (control.down ? Qt.darker(control.accentColor, 1.15) : control.accentColor) :
            (control.down ? control.palette.mid : control.palette.button)
        border.width: control.visualFocus ? 2 : 1
        border.color: control.visualFocus || control.hovered || control.primary || control.checked || control.highlighted ? control.accentColor : control.palette.mid
    }
}
