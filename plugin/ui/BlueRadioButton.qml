import QtQuick
import QtQuick.Templates as T

T.RadioButton {
    id: control
    property color accentColor: "#1976d2"
    implicitWidth: Math.max(implicitBackgroundWidth, implicitContentWidth + leftPadding + rightPadding)
    implicitHeight: Math.max(40, implicitContentHeight + topPadding + bottomPadding)
    padding: 6
    spacing: 8
    hoverEnabled: true
    autoExclusive: true
    opacity: enabled ? 1 : 0.5
    indicator: Rectangle {
        implicitWidth: 22
        implicitHeight: 22
        x: control.mirrored ? control.width - width - control.rightPadding : control.leftPadding
        y: (control.height - height) / 2
        radius: width / 2
        color: control.palette.base
        border.width: control.visualFocus ? 2 : 1
        border.color: control.checked || control.visualFocus || control.hovered ? control.accentColor : control.palette.mid
        Rectangle {
            anchors.centerIn: parent
            width: 12
            height: 12
            radius: width / 2
            visible: control.checked
            color: control.accentColor
        }
    }
    contentItem: Text {
        text: control.text
        font: control.font
        color: control.palette.windowText
        leftPadding: control.mirrored ? 0 : control.indicator.width + control.spacing
        rightPadding: control.mirrored ? control.indicator.width + control.spacing : 0
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    background: Rectangle {
        color: "transparent"
        radius: 4
        border.width: control.visualFocus ? 1 : 0
        border.color: control.accentColor
    }
}
