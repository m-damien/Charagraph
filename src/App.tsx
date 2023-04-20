import React from 'react';
import './App.css';
import { FancyPDF } from './view/pdfViewer/FancyPDF';
import "primereact/resources/themes/saga-blue/theme.css";  //theme
import "primereact/resources/primereact.min.css";                  //core css
import "primeicons/primeicons.css";  
import { CharagraphPanel } from './view/CharagraphPanel';
import { model } from './logic/Model';
import { observer } from 'mobx-react-lite';
import 'animate.css';

export const App = observer(() => {
  const charagraphPanels = [];
  for (const charagraph of model.charagraphs) {
    charagraphPanels.push(<CharagraphPanel key={charagraph.selection.text} charagraph={charagraph}></CharagraphPanel>);
  }

  return (
    <FancyPDF>{charagraphPanels}</FancyPDF>
  );
});
