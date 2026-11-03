import { scenariosIndex } from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import { ScenarioMetadata } from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import { AMC1SpeakerPositioningScenario } from "./AMC1SpeakerPositioningScenario"
import { AMC2ReflectionPointsScenario } from "./AMC2ReflectionPointsScenario"
import { AMC3PointsFollowHeadScenario } from "./AMC3PointsFollowHeadScenario"
import { AMC4PanelSnapScenario } from "./AMC4PanelSnapScenario"
import { AMC5RoomTreatedScenario } from "./AMC5RoomTreatedScenario"
import { AMC6OutOfViewArrowScenario } from "./AMC6OutOfViewArrowScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    { id: "c1-speaker-positioning", typename: AMC1SpeakerPositioningScenario.getTypeName() },
    { id: "c2-reflection-points", typename: AMC2ReflectionPointsScenario.getTypeName() },
    { id: "c3-points-follow-head", typename: AMC3PointsFollowHeadScenario.getTypeName() },
    { id: "c4-panel-snap", typename: AMC4PanelSnapScenario.getTypeName() },
    { id: "c5-room-treated-reset", typename: AMC5RoomTreatedScenario.getTypeName() },
    { id: "c6-out-of-view-arrow", typename: AMC6OutOfViewArrowScenario.getTypeName() },
  ]
}
