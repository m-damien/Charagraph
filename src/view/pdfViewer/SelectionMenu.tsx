import React from 'react';

import { observer } from "mobx-react-lite"
import './SelectionMenu.css'

interface Option {
  label : string;
}

export const SelectionMenu = observer((
  { options, 
    style = {},
    onOptionHovered = undefined,
    onOptionClicked = undefined
  } : {
    options: Option[],
    style : React.CSSProperties,
    onOptionHovered? : (Option) => void,
    onOptionClicked? : (Option) => void
  }
  
  ) => {
  const title = false;

  const buttons = [];
  for (const option of options) {
    buttons.push(<button className="button-39" key={option.label}
      onMouseOver={() => {if (onOptionHovered) onOptionHovered(option)}}
      onMouseUp={() => {if (onOptionClicked) onOptionClicked(option)}}>
      {option.label}</button>)
  }

  return (
  <div className="selectionMenu animate__animated animate__fadeIn" style={style}>
    {title && <div style={{fontSize: 11}}>{title}</div>}
    <div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', overflowY: 'auto', maxWidth: 300, maxHeight: 24}}>
      {buttons}
    </div>
  </div>);
})